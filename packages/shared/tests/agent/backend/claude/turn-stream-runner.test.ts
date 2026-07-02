/**
 * 负责验证 Claude 单轮事件流 runner 的 SDK/队列合流语义。
 * 测试只覆盖事件编排，不构造 Claude SDK options、权限规则或真实 SDK 查询。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'

import { ClaudeEventAdapter } from '../../../../src/agent/backend/claude/event-adapter'
import { ClaudeTurnStreamRunner } from '../../../../src/agent/backend/claude/turn-stream-runner'
import type { AgentEvent, PendingSourceActivationRestart } from '../../../../src/agent'

/**
 * 收集 runner 输出的全部 AgentEvent，方便断言最终事件顺序。
 */
async function collectEvents(runner: ClaudeTurnStreamRunner): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []

  for await (const event of runner.run()) {
    events.push(event)
  }

  return events
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
 * 创建不产出任何队列事件的 async iterator。
 */
async function* createEmptyQueuedEvents(): AsyncGenerator<AgentEvent, void, void> {}

/**
 * 创建延迟一拍后产出队列事件的 iterator，模拟 SDK iterator 先结束的竞态。
 */
async function* createDelayedQueuedEvents(
  events: AgentEvent[]
): AsyncGenerator<AgentEvent, void, void> {
  await new Promise((resolve) => setTimeout(resolve, 0))

  for (const event of events) {
    yield event
  }
}

/**
 * 创建带默认回调的 runner，单测只覆盖自己关心的输入。
 */
function createRunner(
  input: Partial<ConstructorParameters<typeof ClaudeTurnStreamRunner>[0]> & {
    sdkEvents: AsyncIterator<SDKMessage, void>
  }
): ClaudeTurnStreamRunner {
  const eventAdapter = input.eventAdapter ?? new ClaudeEventAdapter()

  eventAdapter.startTurn('turn-1')

  return new ClaudeTurnStreamRunner({
    queuedEvents: createEmptyQueuedEvents(),
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

  it('flushes queued permission events after the SDK iterator finishes first', async () => {
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
    const runner = createRunner({
      sdkEvents: createSdkEvents([]),
      queuedEvents: createDelayedQueuedEvents([permissionEvent])
    })

    await expect(collectEvents(runner)).resolves.toEqual([permissionEvent, { type: 'complete' }])
  })

  it('emits source activation after draining the current tool result batch', async () => {
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
