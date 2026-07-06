// @vitest-environment node

/**
 * 负责验证 SessionToolPermissionRuntime 的工具审批状态管理。
 * 测试只覆盖 server-core 内部运行态，不触发完整 SessionManager 或真实 backend。
 */

import { describe, expect, it, vi } from 'vitest'

import type { AgentBackend, AgentEvent } from '@moon/shared/agent'
import type {
  AgentOperationRecord,
  ChatOperationEvent,
  ToolInvocationRecord
} from '@moon/shared/domain/chat'
import type { SessionEventRouteHint } from '@moon/server-core/sessions/handlers'
import { SessionToolPermissionRuntime } from '@moon/server-core/sessions/session-tool-permission-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'
const routeHint: SessionEventRouteHint = { workspaceId: 'project-1' }

type EventCall = [ChatOperationEvent, SessionEventRouteHint | undefined]

/**
 * 创建满足 AgentBackend contract 的最小 backend fixture。
 */
function createBackend(): AgentBackend {
  return {
    async *chat(): AsyncGenerator<AgentEvent, void, void> {
      yield { type: 'complete' }
    },
    abort: vi.fn(async () => undefined),
    destroy: vi.fn(),
    getModel: vi.fn(() => 'claude-sonnet-4-6'),
    isProcessing: vi.fn(() => false),
    respondToPermission: vi.fn(),
    setModel: vi.fn()
  }
}

/**
 * 创建待更新的 operation 记录，可按测试需要覆盖局部字段。
 */
function createOperation(overrides: Partial<AgentOperationRecord> = {}): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1' },
    provider: 'claude',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'waiting_for_human',
    completionReason: 'waiting_for_human',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建待审批的 tool invocation，可按测试需要覆盖局部字段。
 */
function createToolInvocation(
  overrides: Partial<ToolInvocationRecord> = {}
): ToolInvocationRecord {
  return {
    id: 'tool-1',
    toolCallId: 'tool-1',
    operationId: 'operation-1',
    messageId: 'message-1',
    name: 'Edit',
    arguments: { file_path: 'README.md' },
    state: { agentTurnId: 'turn-1' },
    status: 'waiting_for_human',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 runtime 聚焦测试使用的内存仓储和事件监听器。
 */
function createRuntimeFixture(
  input: {
    operations?: AgentOperationRecord[]
    tools?: ToolInvocationRecord[]
  } = {}
): {
  events: EventCall[]
  operations: Map<string, AgentOperationRecord>
  runtime: SessionToolPermissionRuntime
  tools: Map<string, ToolInvocationRecord>
} {
  const operations = new Map(
    (input.operations ?? [createOperation()]).map((operation) => [operation.id, operation])
  )
  const tools = new Map(
    (input.tools ?? [createToolInvocation()]).map((toolInvocation) => [
      toolInvocation.id,
      toolInvocation
    ])
  )
  const events: EventCall[] = []

  return {
    events,
    operations,
    runtime: new SessionToolPermissionRuntime({
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
    }),
    tools
  }
}

describe('SessionToolPermissionRuntime', () => {
  it('approves pending tool and resumes active backend with tool-finish replay', async () => {
    const backend = createBackend()
    const fixture = createRuntimeFixture()
    fixture.runtime.registerBackend('operation-1', backend)
    fixture.runtime.registerOperationListener(
      'operation-1',
      (event, hint) => fixture.events.push([event, hint]),
      routeHint
    )
    fixture.runtime.trackPendingToolPermission(createToolInvocation(), 'operation-1')

    const updatedTool = await fixture.runtime.approve({
      toolInvocationId: 'tool-1',
      alwaysAllow: true
    })

    expect(updatedTool).toMatchObject({
      id: 'tool-1',
      status: 'done',
      result: { approved: true },
      error: null
    })
    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'running',
      completionReason: null
    })
    expect(backend.respondToPermission).toHaveBeenCalledWith('tool-1', true, true)
    expect(fixture.events).toHaveLength(1)
    expect(fixture.events[0]?.[0]).toMatchObject({
      type: 'tool-finish',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      toolInvocation: updatedTool,
      turnId: 'turn-1'
    })
    expect(fixture.events[0]?.[1]).toEqual(routeHint)
  })

  it('rejects pending tool and resumes active backend with rejection reason', async () => {
    const backend = createBackend()
    const fixture = createRuntimeFixture()
    fixture.runtime.registerBackend('operation-1', backend)
    fixture.runtime.registerOperationListener(
      'operation-1',
      (event, hint) => fixture.events.push([event, hint]),
      routeHint
    )
    fixture.runtime.trackPendingToolPermission(createToolInvocation(), 'operation-1')

    const updatedTool = await fixture.runtime.reject({
      toolInvocationId: 'tool-1',
      reason: 'No thanks'
    })

    expect(updatedTool).toMatchObject({
      id: 'tool-1',
      status: 'rejected',
      result: null,
      error: 'No thanks'
    })
    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'running',
      completionReason: null
    })
    expect(backend.respondToPermission).toHaveBeenCalledWith('tool-1', false, false)
    expect(fixture.events[0]?.[0]).toMatchObject({
      type: 'tool-finish',
      toolInvocation: updatedTool,
      turnId: 'turn-1'
    })
  })

  it('updates pending tool without operation resume or replay when backend is inactive', async () => {
    const fixture = createRuntimeFixture()
    fixture.runtime.registerOperationListener(
      'operation-1',
      (event, hint) => fixture.events.push([event, hint]),
      routeHint
    )
    fixture.runtime.trackPendingToolPermission(createToolInvocation(), 'operation-1')

    const updatedTool = await fixture.runtime.approve({ toolInvocationId: 'tool-1' })

    expect(updatedTool.status).toBe('done')
    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'waiting_for_human',
      completionReason: 'waiting_for_human'
    })
    expect(fixture.events).toEqual([])
  })

  it('rejects all pending tools for an operation without replaying tool-finish', async () => {
    const backend = createBackend()
    const firstTool = createToolInvocation({ id: 'tool-1', toolCallId: 'tool-1' })
    const secondTool = createToolInvocation({
      id: 'tool-2',
      toolCallId: 'tool-2',
      messageId: 'message-2'
    })
    const otherTool = createToolInvocation({
      id: 'tool-other',
      operationId: 'operation-other',
      toolCallId: 'tool-other'
    })
    const fixture = createRuntimeFixture({
      operations: [createOperation(), createOperation({ id: 'operation-other' })],
      tools: [firstTool, secondTool, otherTool]
    })
    fixture.runtime.registerBackend('operation-1', backend)
    fixture.runtime.registerOperationListener(
      'operation-1',
      (event, hint) => fixture.events.push([event, hint]),
      routeHint
    )
    fixture.runtime.trackPendingToolPermission(firstTool, 'operation-1')
    fixture.runtime.trackPendingToolPermission(secondTool, 'operation-1')
    fixture.runtime.trackPendingToolPermission(otherTool, 'operation-other')

    await fixture.runtime.rejectPendingForOperation('operation-1', 'Cancelled by user.')

    expect(fixture.tools.get('tool-1')).toMatchObject({
      status: 'rejected',
      error: 'Cancelled by user.'
    })
    expect(fixture.tools.get('tool-2')).toMatchObject({
      status: 'rejected',
      error: 'Cancelled by user.'
    })
    expect(fixture.tools.get('tool-other')).toMatchObject({ status: 'waiting_for_human' })
    expect(backend.respondToPermission).toHaveBeenCalledWith('tool-1', false, false)
    expect(backend.respondToPermission).toHaveBeenCalledWith('tool-2', false, false)
    expect(fixture.events).toEqual([])
  })

  it('returns non-waiting tool unchanged and throws when tool is missing', async () => {
    const doneTool = createToolInvocation({
      status: 'done',
      result: { approved: true }
    })
    const fixture = createRuntimeFixture({ tools: [doneTool] })

    await expect(fixture.runtime.approve({ toolInvocationId: 'missing' })).rejects.toThrow(
      'Tool invocation not found.'
    )
    await expect(fixture.runtime.reject({ toolInvocationId: 'tool-1' })).resolves.toBe(doneTool)
  })

  it('tracks and clears pending permissions idempotently', async () => {
    const toolInvocation = createToolInvocation()
    const fixture = createRuntimeFixture({ tools: [toolInvocation] })
    fixture.runtime.trackPendingToolPermission(toolInvocation, 'operation-1')
    fixture.runtime.clearPendingToolPermission('tool-1')
    fixture.runtime.clearPendingToolPermission('tool-1')

    await fixture.runtime.rejectPendingForOperation('operation-1', 'Cancelled by user.')

    expect(fixture.tools.get('tool-1')).toMatchObject({ status: 'waiting_for_human' })
  })
})
