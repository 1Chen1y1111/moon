// @vitest-environment node

/**
 * 负责验证 SessionOperationLifecycleRuntime 的 operation 启动和取消控制面。
 * 测试只覆盖 server-core 内部生命周期运行态，不触发真实 backend 执行。
 */

import { describe, expect, it, vi } from 'vitest'

import type {
  AgentOperationRecord,
  ChatOperationEvent,
  MessageRecord,
  ToolInvocationRecord
} from '@moon/shared/domain/chat'
import type { SessionEventRouteHint } from '@moon/server-core/sessions/handlers'
import { SessionOperationLifecycleRuntime } from '@moon/server-core/sessions/session-operation-lifecycle-runtime'
import { SessionToolPermissionRuntime } from '@moon/server-core/sessions/session-tool-permission-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'
const routeHint: SessionEventRouteHint = { workspaceId: 'project-1' }

type EventCall = [ChatOperationEvent, SessionEventRouteHint | undefined]

/**
 * 创建生命周期测试使用的 operation 记录。
 */
function createOperation(overrides: Partial<AgentOperationRecord> = {}): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1' },
    provider: 'claude',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'idle',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 operation 关联消息，默认包含 user 和 pending assistant 两类测试形态。
 */
function createMessage(
  role: MessageRecord['role'],
  overrides: Partial<MessageRecord> = {}
): MessageRecord {
  return {
    id: `${role}-message-1`,
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    operationId: 'operation-1',
    role,
    content: role === 'user' ? 'hello' : '',
    status: role === 'user' ? 'complete' : 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建等待审批的工具调用，用于验证取消 operation 时的权限清理。
 */
function createToolInvocation(
  overrides: Partial<ToolInvocationRecord> = {}
): ToolInvocationRecord {
  return {
    id: 'tool-1',
    toolCallId: 'tool-1',
    operationId: 'operation-1',
    messageId: 'assistant-message-1',
    name: 'Edit',
    arguments: { file_path: 'README.md' },
    status: 'waiting_for_human',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 lifecycle runtime 聚焦测试需要的内存仓储和权限 runtime。
 */
function createRuntimeFixture(
  input: {
    messages?: MessageRecord[]
    operations?: AgentOperationRecord[]
    tools?: ToolInvocationRecord[]
  } = {}
): {
  events: EventCall[]
  messages: Map<string, MessageRecord>
  operations: Map<string, AgentOperationRecord>
  runtime: SessionOperationLifecycleRuntime
  toolPermissionRuntime: SessionToolPermissionRuntime
  tools: Map<string, ToolInvocationRecord>
} {
  const operations = new Map(
    (input.operations ?? [createOperation()]).map((operation) => [operation.id, operation])
  )
  const messages = new Map(
    (input.messages ?? [createMessage('user'), createMessage('assistant')]).map((message) => [
      message.id,
      message
    ])
  )
  const tools = new Map(
    (input.tools ?? []).map((toolInvocation) => [toolInvocation.id, toolInvocation])
  )
  const events: EventCall[] = []
  const toolPermissionRuntime = new SessionToolPermissionRuntime({
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (operation) => {
        operations.set(operation.id, operation)

        return operation
      }
    },
    toolInvocationsRepository: {
      findById: async (id) => tools.get(id) ?? null,
      save: async (toolInvocation) => {
        tools.set(toolInvocation.id, toolInvocation)

        return toolInvocation
      }
    }
  })

  return {
    events,
    messages,
    operations,
    runtime: new SessionOperationLifecycleRuntime({
      agentOperationsRepository: {
        findById: async (id) => operations.get(id) ?? null,
        save: async (operation) => {
          operations.set(operation.id, operation)

          return operation
        }
      },
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
      toolPermissionRuntime
    }),
    toolPermissionRuntime,
    tools
  }
}

/**
 * 启动默认 operation，并把 operation-started 事件收集到 fixture。
 */
function startDefaultOperation(fixture: ReturnType<typeof createRuntimeFixture>) {
  const operation = fixture.operations.get('operation-1')
  const assistantMessage = fixture.messages.get('assistant-message-1')

  if (operation === undefined || assistantMessage === undefined) {
    throw new Error('Fixture is missing default operation messages.')
  }

  return fixture.runtime.start({
    assistantMessage,
    onEvent: (event, hint) => fixture.events.push([event, hint]),
    operation,
    routeHint
  })
}

describe('SessionOperationLifecycleRuntime', () => {
  it('starts operation, streams assistant message, emits event, and returns abort signal', async () => {
    const fixture = createRuntimeFixture()

    const result = await startDefaultOperation(fixture)

    expect(result.abortSignal.aborted).toBe(false)
    expect(result.operation).toMatchObject({
      id: 'operation-1',
      status: 'running',
      completionReason: null,
      error: null
    })
    expect(result.assistantMessage).toMatchObject({
      id: 'assistant-message-1',
      status: 'streaming',
      error: null
    })
    expect(fixture.operations.get('operation-1')).toBe(result.operation)
    expect(fixture.messages.get('assistant-message-1')).toBe(result.assistantMessage)
    expect(fixture.events).toHaveLength(1)
    expect(fixture.events[0]?.[0]).toMatchObject({
      type: 'operation-started',
      operationId: 'operation-1',
      operation: result.operation
    })
    expect(fixture.events[0]?.[1]).toEqual(routeHint)
  })

  it('releases active abort controller idempotently', async () => {
    const fixture = createRuntimeFixture()
    const result = await startDefaultOperation(fixture)

    fixture.runtime.release('operation-1')
    fixture.runtime.release('operation-1')

    await fixture.runtime.cancel({ operationId: 'operation-1' })

    expect(result.abortSignal.aborted).toBe(false)
  })

  it('cancels active operation, aborts signal, rejects pending permission, and cancels assistant', async () => {
    const pendingTool = createToolInvocation()
    const fixture = createRuntimeFixture({ tools: [pendingTool] })
    const result = await startDefaultOperation(fixture)
    fixture.toolPermissionRuntime.trackPendingToolPermission(pendingTool, 'operation-1')

    const cancelledOperation = await fixture.runtime.cancel({ operationId: 'operation-1' })

    expect(result.abortSignal.aborted).toBe(true)
    expect(cancelledOperation).toMatchObject({
      id: 'operation-1',
      status: 'interrupted',
      completionReason: 'interrupted',
      error: null
    })
    expect(fixture.messages.get('assistant-message-1')).toMatchObject({
      status: 'cancelled',
      error: 'Cancelled by user.'
    })
    expect(fixture.tools.get('tool-1')).toMatchObject({
      status: 'rejected',
      error: 'Cancelled by user.'
    })
  })

  it('returns done operation unchanged without rejecting pending permission', async () => {
    const doneOperation = createOperation({
      status: 'done',
      completionReason: 'done'
    })
    const pendingTool = createToolInvocation()
    const fixture = createRuntimeFixture({
      operations: [doneOperation],
      tools: [pendingTool]
    })
    const rejectPendingSpy = vi.spyOn(
      fixture.toolPermissionRuntime,
      'rejectPendingForOperation'
    )

    const result = await fixture.runtime.cancel({ operationId: 'operation-1' })

    expect(result).toBe(doneOperation)
    expect(rejectPendingSpy).not.toHaveBeenCalled()
    expect(fixture.tools.get('tool-1')).toMatchObject({ status: 'waiting_for_human' })
  })

  it('throws when operation is missing', async () => {
    const fixture = createRuntimeFixture({ operations: [] })

    await expect(fixture.runtime.cancel({ operationId: 'operation-1' })).rejects.toThrow(
      'Agent operation not found.'
    )
  })

  it('cancels operation even when assistant message is missing', async () => {
    const userMessage = createMessage('user')
    const fixture = createRuntimeFixture({ messages: [userMessage] })

    const cancelledOperation = await fixture.runtime.cancel({ operationId: 'operation-1' })

    expect(cancelledOperation).toMatchObject({
      status: 'interrupted',
      completionReason: 'interrupted'
    })
    expect(fixture.messages.get('user-message-1')).toBe(userMessage)
    expect([...fixture.messages.values()]).toHaveLength(1)
  })
})
