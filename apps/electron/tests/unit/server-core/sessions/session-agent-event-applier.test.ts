// @vitest-environment node

/**
 * 负责验证 SessionAgentEventApplier 对 backend AgentEvent 的落库和广播映射。
 * 测试只覆盖 server-core event application 边界，不触发完整 SessionManager 流程。
 */

import { describe, expect, it, vi } from 'vitest'

import type { AgentEvent } from '@moon/shared/agent'
import type {
  AgentOperationRecord,
  ChatOperationEvent,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import {
  SessionAgentEventApplier,
  type SessionAgentEventApplierInput
} from '@moon/server-core/sessions/session-agent-event-applier'
import type { SessionEventRouteHint } from '@moon/server-core/sessions/handlers'
import type { SessionSourceProviderScope } from '@moon/server-core/sessions/session-agent-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'
const routeHint: SessionEventRouteHint = { workspaceId: 'project-1' }

type EventCall = [ChatOperationEvent, SessionEventRouteHint | undefined]

/**
 * 创建 applier 测试所需的最小会话 scope。
 */
function createScope(): SessionSourceProviderScope {
  const project: ProjectRecord = {
    id: 'project-1',
    name: 'Moon',
    path: '/workspace/moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const session: SessionRecord = {
    id: 'session-1',
    projectId: project.id,
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const topic: TopicRecord = {
    id: 'topic-1',
    sessionId: session.id,
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const thread: ThreadRecord = {
    id: 'thread-1',
    topicId: topic.id,
    title: '主线',
    type: 'standalone',
    createdAt: timestamp,
    updatedAt: timestamp
  }

  return { project, session, topic, thread }
}

/**
 * 创建待更新的 assistant message 记录，可按测试需要覆盖局部字段。
 */
function createMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    operationId: 'operation-1',
    role: 'assistant',
    content: '',
    status: 'streaming',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建待更新的 agent operation 记录，可按测试需要覆盖局部字段。
 */
function createOperation(overrides: Partial<AgentOperationRecord> = {}): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1' },
    provider: 'claude',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建聚焦测试使用的内存仓储和 applier 实例。
 */
function createApplierFixture(): {
  applier: SessionAgentEventApplier
  clearPendingToolPermission: ReturnType<typeof vi.fn>
  events: EventCall[]
  messages: Map<string, MessageRecord>
  onEvent: (event: ChatOperationEvent, hint?: SessionEventRouteHint) => void
  operations: Map<string, AgentOperationRecord>
  recordActivatedSource: ReturnType<typeof vi.fn>
  recordProviderSessionId: ReturnType<typeof vi.fn>
  scope: SessionSourceProviderScope
  threads: Map<string, ThreadRecord>
  tools: Map<string, ToolInvocationRecord>
  trackPendingToolPermission: ReturnType<typeof vi.fn>
} {
  const messages = new Map<string, MessageRecord>()
  const operations = new Map<string, AgentOperationRecord>()
  const tools = new Map<string, ToolInvocationRecord>()
  const scope = createScope()
  const threads = new Map([[scope.thread.id, scope.thread]])
  const events: EventCall[] = []
  const recordActivatedSource = vi.fn()
  const recordProviderSessionId = vi.fn()
  const trackPendingToolPermission = vi.fn()
  const clearPendingToolPermission = vi.fn()
  const input: SessionAgentEventApplierInput = {
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (operation) => {
        operations.set(operation.id, operation)

        return operation
      }
    },
    clearPendingToolPermission,
    messagesRepository: {
      listByOperation: async (operationId) =>
        [...messages.values()].filter((message) => message.operationId === operationId),
      listByThread: async (threadId) =>
        [...messages.values()].filter((message) => message.threadId === threadId),
      save: async (message) => {
        messages.set(message.id, message)

        return message
      }
    },
    recordActivatedSource,
    recordProviderSessionId,
    threadsRepository: {
      findById: async (id) => threads.get(id) ?? null,
      listBySession: async () => [...threads.values()],
      listByTopic: async (topicId) =>
        [...threads.values()].filter((thread) => thread.topicId === topicId),
      save: async (thread) => {
        threads.set(thread.id, thread)

        return thread
      }
    },
    toolInvocationsRepository: {
      findById: async (id) => tools.get(id) ?? null,
      save: async (toolInvocation) => {
        tools.set(toolInvocation.id, toolInvocation)

        return toolInvocation
      }
    },
    trackPendingToolPermission
  }

  return {
    applier: new SessionAgentEventApplier(input),
    clearPendingToolPermission,
    events,
    messages,
    onEvent: (event, hint) => {
      events.push([event, hint])
    },
    operations,
    recordActivatedSource,
    recordProviderSessionId,
    scope,
    threads,
    tools,
    trackPendingToolPermission
  }
}

/**
 * 应用单个 event，并复用测试默认的 message、operation、scope 和 route hint。
 */
async function applyEvent(
  fixture: ReturnType<typeof createApplierFixture>,
  event: AgentEvent,
  overrides: {
    message?: MessageRecord
    operation?: AgentOperationRecord
  } = {}
) {
  return fixture.applier.apply({
    event,
    message: overrides.message ?? createMessage(),
    onEvent: fixture.onEvent,
    operation: overrides.operation ?? createOperation(),
    routeHint,
    scope: fixture.scope
  })
}

describe('SessionAgentEventApplier', () => {
  it('updates message content and reasoning while emitting deltas', async () => {
    const fixture = createApplierFixture()

    const textResult = await applyEvent(fixture, {
      type: 'text_delta',
      text: 'hello',
      turnId: 'turn-1'
    })
    const reasoningResult = await applyEvent(
      fixture,
      {
        type: 'reasoning_delta',
        text: 'thinking',
        turnId: 'turn-2'
      },
      { message: textResult.message }
    )
    const completeResult = await applyEvent(
      fixture,
      {
        type: 'text_complete',
        text: 'fallback text',
        turnId: 'turn-3'
      },
      { message: createMessage({ id: 'message-2' }) }
    )

    expect(textResult.message.content).toBe('hello')
    expect(textResult.message.metadata).toEqual({ agentTurnId: 'turn-1' })
    expect(reasoningResult.message.reasoning).toBe('thinking')
    expect(reasoningResult.message.content).toBe('hello')
    expect(completeResult.message.content).toBe('fallback text')
    expect(fixture.events.map(([event]) => event.type)).toEqual([
      'message-delta',
      'reasoning-delta',
      'message-delta'
    ])
    expect(fixture.events.map(([, hint]) => hint)).toEqual([routeHint, routeHint, routeHint])
    expect(fixture.events[0]?.[0]).toMatchObject({ delta: 'hello', turnId: 'turn-1' })
    expect(fixture.events[1]?.[0]).toMatchObject({ delta: 'thinking', turnId: 'turn-2' })
    expect(fixture.events[2]?.[0]).toMatchObject({ delta: 'fallback text', turnId: 'turn-3' })
  })

  it('updates operation metadata and usage for backend lifecycle events', async () => {
    const fixture = createApplierFixture()
    const message = createMessage()
    let operation = createOperation()

    operation = (
      await applyEvent(fixture, { type: 'session_id_update', sessionId: 'claude-session-1' }, {
        message,
        operation
      })
    ).operation
    operation = (
      await applyEvent(
        fixture,
        {
          type: 'usage_update',
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 2,
            cacheCreationTokens: 3,
            costUsd: 0.12
          }
        },
        { message, operation }
      )
    ).operation
    operation = (
      await applyEvent(
        fixture,
        { type: 'status', message: 'Compacting', statusType: 'compacting' },
        { message, operation }
      )
    ).operation
    operation = (
      await applyEvent(
        fixture,
        { type: 'info', message: 'Ready', level: 'success' },
        { message, operation }
      )
    ).operation

    expect(operation.metadata?.providerSessionId).toBe('claude-session-1')
    expect(fixture.recordProviderSessionId).toHaveBeenCalledWith(
      'thread-1',
      'claude-session-1'
    )
    expect(fixture.threads.get('thread-1')?.metadata).toMatchObject({
      providerSessionId: 'claude-session-1'
    })
    expect(operation.totalInputTokens).toBe(10)
    expect(operation.totalOutputTokens).toBe(5)
    expect(operation.totalTokens).toBe(20)
    expect(operation.totalCost).toBe('0.12')
    expect(operation.usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 2,
      cacheCreationTokens: 3,
      totalTokens: 20
    })
    expect(operation.metadata?.lastAgentStatus).toMatchObject({
      message: 'Compacting',
      statusType: 'compacting'
    })
    expect(operation.metadata?.lastAgentInfo).toMatchObject({
      message: 'Ready',
      level: 'success'
    })
  })

  it('records source activation, emits source event, and returns retry signal', async () => {
    const fixture = createApplierFixture()

    const result = await applyEvent(fixture, {
      type: 'source_activated',
      sourceSlug: 'linear',
      originalMessage: 'create an issue',
      turnId: 'turn-source'
    })

    expect(fixture.recordActivatedSource).toHaveBeenCalledWith('thread-1', 'linear')
    expect(result.sourceActivation).toEqual({
      sourceSlug: 'linear',
      originalMessage: 'create an issue'
    })
    expect(fixture.events).toHaveLength(1)
    expect(fixture.events[0]?.[0]).toMatchObject({
      type: 'source-activated',
      sourceSlug: 'linear',
      originalMessage: 'create an issue',
      turnId: 'turn-source'
    })
    expect(fixture.events[0]?.[1]).toEqual(routeHint)
  })

  it('creates waiting tool invocation and marks operation waiting for permission request', async () => {
    const fixture = createApplierFixture()

    const result = await applyEvent(fixture, {
      type: 'permission_request',
      turnId: 'turn-permission',
      request: {
        requestId: 'request-1',
        toolName: 'Bash',
        description: 'Run pwd',
        command: 'pwd',
        type: 'bash',
        reason: 'inspect cwd',
        impact: 'read-only'
      }
    })

    const toolInvocation = fixture.tools.get('request-1')

    expect(toolInvocation).toMatchObject({
      id: 'request-1',
      toolCallId: 'request-1',
      operationId: 'operation-1',
      messageId: 'message-1',
      name: 'Bash',
      status: 'waiting_for_human',
      arguments: {
        description: 'Run pwd',
        command: 'pwd',
        type: 'bash',
        reason: 'inspect cwd',
        impact: 'read-only'
      },
      intervention: {
        type: 'permission_request',
        description: 'Run pwd',
        command: 'pwd',
        reason: 'inspect cwd',
        impact: 'read-only'
      },
      state: { agentTurnId: 'turn-permission' }
    })
    expect(result.operation).toMatchObject({
      status: 'waiting_for_human',
      completionReason: 'waiting_for_human',
      humanInterventions: 1
    })
    expect(fixture.trackPendingToolPermission).toHaveBeenCalledWith(
      toolInvocation,
      result.operation.id
    )
    expect(fixture.events[0]?.[0]).toMatchObject({
      type: 'tool-waiting-approval',
      toolInvocation,
      turnId: 'turn-permission'
    })
  })

  it('applies tool start and tool result events while tracking permission state', async () => {
    const fixture = createApplierFixture()

    await applyEvent(fixture, {
      type: 'tool_start',
      toolUseId: 'tool-1',
      toolName: 'Read',
      input: { file_path: 'README.md' },
      turnId: 'turn-tool'
    })
    const waitingResult = await applyEvent(fixture, {
      type: 'tool_start',
      toolUseId: 'tool-2',
      toolName: 'Edit',
      input: { file_path: 'README.md' },
      status: 'waiting_for_human',
      turnId: 'turn-waiting'
    })
    await applyEvent(fixture, {
      type: 'tool_result',
      toolUseId: 'tool-1',
      toolName: 'Read',
      result: 'ok',
      isError: false,
      input: { file_path: 'README.md' },
      turnId: 'turn-tool'
    })
    await applyEvent(fixture, {
      type: 'tool_result',
      toolUseId: 'tool-2',
      toolName: 'Edit',
      result: new Error('edit failed'),
      isError: true,
      input: { file_path: 'README.md' },
      turnId: 'turn-waiting'
    })

    expect(fixture.tools.get('tool-1')).toMatchObject({
      name: 'Read',
      status: 'done',
      result: { value: 'ok' },
      state: { agentTurnId: 'turn-tool' }
    })
    expect(fixture.tools.get('tool-2')).toMatchObject({
      name: 'Edit',
      status: 'error',
      error: 'edit failed',
      state: { agentTurnId: 'turn-waiting' }
    })
    expect(waitingResult.operation).toMatchObject({
      status: 'waiting_for_human',
      completionReason: 'waiting_for_human',
      humanInterventions: 1
    })
    expect(fixture.trackPendingToolPermission).toHaveBeenCalledTimes(1)
    expect(fixture.clearPendingToolPermission).toHaveBeenCalledWith('tool-1')
    expect(fixture.clearPendingToolPermission).toHaveBeenCalledWith('tool-2')
    expect(fixture.events.map(([event]) => event.type)).toEqual([
      'tool-start',
      'tool-waiting-approval',
      'tool-finish',
      'tool-finish'
    ])
  })

  it('throws error events without converting them to chat events', async () => {
    const fixture = createApplierFixture()

    await expect(applyEvent(fixture, { type: 'error', message: 'model down' })).rejects.toThrow(
      'model down'
    )
    await expect(
      applyEvent(fixture, {
        type: 'typed_error',
        error: {
          code: 'auth',
          title: 'Authentication failed',
          message: 'bad key'
        }
      })
    ).rejects.toThrow('bad key')
    expect(fixture.events).toEqual([])
  })
})
