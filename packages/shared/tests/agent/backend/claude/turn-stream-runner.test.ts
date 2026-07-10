/**
 * 负责验证 Claude 单轮事件流 runner 的 SDK/队列合流语义。
 * 测试只覆盖事件编排，不构造 Claude SDK options、权限规则或真实 SDK 查询。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'

import { ClaudeEventAdapter } from '../../../../src/agent/backend/claude/event-adapter'
import {
  ClaudeTurnStreamRunner,
  type ClaudeTurnStreamResult
} from '../../../../src/agent/backend/claude/turn-stream-runner'
import { EventQueue } from '../../../../src/agent/backend/event-queue'
import type { AgentEvent, PendingSourceActivationRestart } from '../../../../src/agent'

/**
 * 收集 runner 输出的全部 AgentEvent，方便断言最终事件顺序。
 */
async function collectRun(runner: ClaudeTurnStreamRunner): Promise<{
  events: AgentEvent[]
  result: ClaudeTurnStreamResult
}> {
  const events: AgentEvent[] = []
  const eventStream = runner.run()
  let next = await eventStream.next()

  while (!next.done) {
    events.push(next.value)
    next = await eventStream.next()
  }

  return { events, result: next.value }
}

/**
 * 模拟 ClaudeAgent 在确认无需恢复后补发 runner 暂存的 complete。
 */
async function collectEvents(runner: ClaudeTurnStreamRunner): Promise<AgentEvent[]> {
  const { events, result } = await collectRun(runner)

  return result.completionEvent === null ? events : [...events, result.completionEvent]
}

/**
 * 创建按顺序产出固定 SDK 消息的 async iterator。
 */
async function* createSdkEvents(messages: SDKMessage[]): AsyncGenerator<SDKMessage, void, void> {
  for (const message of messages) {
    yield message
  }
}

/**
 * 创建会在读取时抛错的 SDK iterator，用于验证队列生命周期兜底。
 */
async function* createThrowingSdkEvents(): AsyncGenerator<SDKMessage, void, void> {
  throw new Error('SDK stream failed')
}

/**
 * 创建带默认回调的 runner，单测只覆盖自己关心的输入。
 */
function createRunner(
  input: Partial<ConstructorParameters<typeof ClaudeTurnStreamRunner>[0]> & {
    sdkEvents: AsyncIterable<SDKMessage>
  }
): ClaudeTurnStreamRunner {
  const eventAdapter = input.eventAdapter ?? new ClaudeEventAdapter()

  eventAdapter.startTurn('turn-1')

  return new ClaudeTurnStreamRunner({
    eventQueue: new EventQueue(),
    normalizeAgentEvent: (event) => event,
    handleToolResultError: () => undefined,
    consumePendingSourceActivationRestart: () => null,
    ...input,
    eventAdapter
  })
}

describe('ClaudeTurnStreamRunner', () => {
  it('adapts SDK assistant and result messages into AgentEvents', async () => {
    const runner = createRunner({
      sdkEvents: createSdkEvents([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'ok' }]
          }
        } as SDKMessage,
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: 'sdk-session-1'
        } as SDKMessage
      ])
    })

    await expect(collectEvents(runner)).resolves.toEqual([
      { type: 'text_complete', text: 'ok', turnId: 'turn-1' },
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      { type: 'complete' }
    ])
  })

  it('returns completion separately so the caller can decide whether to recover first', async () => {
    const runner = createRunner({
      sdkEvents: createSdkEvents([
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: 'sdk-session-1'
        } as SDKMessage
      ])
    })

    await expect(collectRun(runner)).resolves.toEqual({
      events: [{ type: 'session_id_update', sessionId: 'sdk-session-1' }],
      result: { completionEvent: { type: 'complete' } }
    })
  })

  it('completes the EventQueue when the SDK iterator finishes', async () => {
    const eventQueue = new EventQueue()
    const runner = createRunner({
      sdkEvents: createSdkEvents([]),
      eventQueue
    })

    await expect(collectEvents(runner)).resolves.toEqual([{ type: 'complete' }])
    expect(eventQueue.isComplete).toBe(true)
  })

  it('completes the EventQueue when the SDK iterator throws', async () => {
    const eventQueue = new EventQueue()
    const runner = createRunner({
      sdkEvents: createThrowingSdkEvents(),
      eventQueue
    })

    await expect(collectEvents(runner)).rejects.toThrow('SDK stream failed')
    expect(eventQueue.isComplete).toBe(true)
  })

  it('flushes queued permission events after the SDK iterator finishes first', async () => {
    const eventQueue = new EventQueue()
    const permissionEvent: AgentEvent = {
      type: 'permission_request',
      turnId: 'turn-1',
      request: {
        requestId: 'permission-1',
        toolName: 'Bash',
        description: '运行命令',
        command: 'pwd',
        type: 'bash'
      }
    }
    eventQueue.enqueue(permissionEvent)
    const runner = createRunner({
      sdkEvents: createSdkEvents([]),
      eventQueue
    })

    await expect(collectEvents(runner)).resolves.toEqual([permissionEvent, { type: 'complete' }])
    expect(eventQueue.isComplete).toBe(true)
  })

  it('emits source activation after draining the current tool result batch', async () => {
    const eventQueue = new EventQueue()
    let pending: PendingSourceActivationRestart | null = null
    const consumePending = (): PendingSourceActivationRestart | null => {
      const current = pending

      pending = null
      return current
    }
    const handleToolResultError = vi.fn(() => {
      pending = {
        sourceSlug: 'linear',
        originalMessage: 'create issue'
      }
    })
    const runner = createRunner({
      sdkEvents: createSdkEvents([
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'source-tool-1',
                name: 'mcp__linear__createIssue',
                input: { title: 'Bug' }
              }
            ]
          }
        } as SDKMessage,
        {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'source-tool-1',
                content: 'No such tool available: mcp__linear__createIssue',
                is_error: true
              }
            ]
          }
        } as SDKMessage
      ]),
      eventQueue,
      handleToolResultError,
      consumePendingSourceActivationRestart: consumePending
    })

    await expect(collectEvents(runner)).resolves.toEqual([
      {
        type: 'tool_start',
        toolUseId: 'source-tool-1',
        toolName: 'mcp__linear__createIssue',
        input: { title: 'Bug' },
        turnId: 'turn-1'
      },
      {
        type: 'source_activated',
        sourceSlug: 'linear',
        originalMessage: 'create issue',
        turnId: 'turn-1'
      }
    ])
    expect(handleToolResultError).toHaveBeenCalledTimes(1)
    expect(eventQueue.isComplete).toBe(true)
  })

  it('adds a complete event when the SDK stream does not emit one', async () => {
    const runner = createRunner({
      sdkEvents: createSdkEvents([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'partial only' }]
          }
        } as SDKMessage
      ])
    })

    await expect(collectEvents(runner)).resolves.toEqual([
      { type: 'text_complete', text: 'partial only', turnId: 'turn-1' },
      { type: 'complete' }
    ])
  })
})
