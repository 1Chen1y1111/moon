// @vitest-environment node

/**
 * 负责验证 SessionManager 发出的 runtime event 会携带内部路由提示。
 * 测试使用内存仓储和 fake backend，不触发 Electron、IPC、PGlite 或真实 SDK。
 */

import { describe, expect, it, vi } from 'vitest'

import type { AgentBackend, AgentEvent } from '@moon/shared/agent'
import { createDefaultLlmConnection } from '@moon/shared/config'
import type {
  AgentOperationRecord,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import { createDefaultAppSettings } from '@moon/shared/domain/settings'
import { SessionManager, type SessionManagerDependencies } from '@moon/server-core/sessions'

const timestamp = '2026-05-09T00:00:00.000Z'

type EntityRecord =
  | AgentOperationRecord
  | MessageRecord
  | ProjectRecord
  | SessionRecord
  | ThreadRecord
  | ToolInvocationRecord
  | TopicRecord

type EventCall = Parameters<NonNullable<Parameters<SessionManager['runOperation']>[1]>>

function createSession(): SessionRecord {
  return {
    id: 'session-1',
    llmConnectionId: 'connection-1',
    projectId: 'project-1',
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createTopic(): TopicRecord {
  return {
    id: 'topic-1',
    sessionId: 'session-1',
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createThread(): ThreadRecord {
  return {
    id: 'thread-1',
    topicId: 'topic-1',
    title: 'Moon',
    type: 'standalone',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createOperation(): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1' },
    provider: 'claude',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'idle',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createMessage(role: MessageRecord['role']): MessageRecord {
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
    updatedAt: timestamp
  }
}

function createProject(): ProjectRecord {
  return {
    id: 'project-1',
    path: '/tmp/moon-project',
    name: 'Moon Project',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createRecordMap<TRecord extends EntityRecord>(
  records: TRecord[]
): Map<string, TRecord> {
  return new Map(records.map((record) => [record.id, record]))
}

function createBackend(events: AgentEvent[]): AgentBackend {
  return {
    async *chat() {
      for (const event of events) {
        yield event
      }
    },
    respondToPermission: vi.fn(),
    abort: vi.fn(async () => undefined),
    destroy: vi.fn()
  }
}

function createPermissionBackend(): {
  backend: AgentBackend
  respondToPermission: ReturnType<typeof vi.fn>
} {
  let resolvePermission!: () => void
  const permissionResolved = new Promise<void>((resolve) => {
    resolvePermission = resolve
  })
  const respondToPermission = vi.fn(() => {
    resolvePermission()
  })
  const backend: AgentBackend = {
    async *chat() {
      yield { type: 'text_delta', text: 'hello ' }
      yield {
        type: 'permission_request',
        request: {
          requestId: 'tool-1',
          toolName: 'bash',
          description: 'Run pwd',
          command: 'pwd'
        }
      }
      await permissionResolved
      yield { type: 'text_delta', text: 'done' }
    },
    respondToPermission,
    abort: vi.fn(async () => undefined),
    destroy: vi.fn()
  }

  return { backend, respondToPermission }
}

function createManagerFixture(backend: AgentBackend): SessionManager {
  const session = createSession()
  const topic = createTopic()
  const thread = createThread()
  const operation = createOperation()
  const userMessage = createMessage('user')
  const assistantMessage = createMessage('assistant')
  const project = createProject()
  const operations = createRecordMap([operation])
  const messages = createRecordMap([userMessage, assistantMessage])
  const sessions = createRecordMap([session])
  const topics = createRecordMap([topic])
  const threads = createRecordMap([thread])
  const toolInvocations = createRecordMap<ToolInvocationRecord>([])
  const projects = createRecordMap([project])
  const connection = {
    ...createDefaultLlmConnection('anthropic'),
    id: 'connection-1',
    name: 'Test Claude',
    apiKey: 'test-key',
    providerId: 'test-provider'
  }
  const settings = createDefaultAppSettings()
  const dependencies: SessionManagerDependencies = {
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (nextOperation) => {
        operations.set(nextOperation.id, nextOperation)

        return nextOperation
      }
    },
    createAgentBackend: () => backend,
    messagesRepository: {
      listByThread: async (threadId) =>
        [...messages.values()].filter((message) => message.threadId === threadId),
      listByOperation: async (operationId) =>
        [...messages.values()].filter((message) => message.operationId === operationId),
      save: async (nextMessage) => {
        messages.set(nextMessage.id, nextMessage)

        return nextMessage
      }
    },
    projectsRepository: {
      findById: async (id) => projects.get(id) ?? null,
      getActiveProject: async () => project
    },
    sessionsRepository: {
      list: async () => [...sessions.values()],
      findById: async (id) => sessions.get(id) ?? null,
      save: async (nextSession) => {
        sessions.set(nextSession.id, nextSession)

        return nextSession
      },
      deleteById: async (id) => {
        sessions.delete(id)
      }
    },
    settingsRepository: {
      findLlmConnectionById: async (id) => (id === connection.id ? connection : null),
      getProviderApiKey: async () => 'test-key',
      getSettings: async () => settings,
      selectDefaultLlmConnection: async () => connection
    },
    threadsRepository: {
      findById: async (id) => threads.get(id) ?? null,
      listBySession: async () => [...threads.values()],
      listByTopic: async (topicId) =>
        [...threads.values()].filter((currentThread) => currentThread.topicId === topicId),
      save: async (nextThread) => {
        threads.set(nextThread.id, nextThread)

        return nextThread
      }
    },
    toolInvocationsRepository: {
      findById: async (id) => toolInvocations.get(id) ?? null,
      save: async (nextToolInvocation) => {
        toolInvocations.set(nextToolInvocation.id, nextToolInvocation)

        return nextToolInvocation
      }
    },
    topicsRepository: {
      findById: async (id) => topics.get(id) ?? null,
      listBySession: async (sessionId) =>
        [...topics.values()].filter((currentTopic) => currentTopic.sessionId === sessionId),
      save: async (nextTopic) => {
        topics.set(nextTopic.id, nextTopic)

        return nextTopic
      }
    }
  }

  return new SessionManager(dependencies)
}

async function waitForEvent(calls: EventCall[], eventType: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (calls.some(([event]) => event.type === eventType)) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error(`Timed out waiting for ${eventType}`)
}

describe('SessionManager session event routing', () => {
  it('attaches workspace route hints to operation and agent runtime events', async () => {
    const { backend, respondToPermission } = createPermissionBackend()
    const manager = createManagerFixture(backend)
    const onEvent = vi.fn()
    const operationPromise = manager.runOperation({ operationId: 'operation-1' }, onEvent)

    await waitForEvent(onEvent.mock.calls, 'tool-waiting-approval')
    await manager.approveToolCall({ toolInvocationId: 'tool-1' })
    await operationPromise

    expect(respondToPermission).toHaveBeenCalledWith('tool-1', true, false)

    const routeHintByEventType = new Map(
      onEvent.mock.calls.map(([event, routeHint]) => [event.type, routeHint])
    )

    expect(routeHintByEventType.get('operation-started')).toEqual({ workspaceId: 'project-1' })
    expect(routeHintByEventType.get('message-delta')).toEqual({ workspaceId: 'project-1' })
    expect(routeHintByEventType.get('tool-waiting-approval')).toEqual({
      workspaceId: 'project-1'
    })
    expect(routeHintByEventType.get('tool-finish')).toEqual({ workspaceId: 'project-1' })
    expect(routeHintByEventType.get('operation-done')).toEqual({ workspaceId: 'project-1' })
  })

  it('attaches workspace route hints to operation errors', async () => {
    const manager = createManagerFixture(
      createBackend([
        { type: 'text_delta', text: 'partial' },
        { type: 'error', message: 'model down' }
      ])
    )
    const onEvent = vi.fn()

    await expect(manager.runOperation({ operationId: 'operation-1' }, onEvent)).rejects.toThrow(
      'model down'
    )

    const errorEventCall = onEvent.mock.calls.find(([event]) => event.type === 'operation-error')

    expect(errorEventCall?.[1]).toEqual({ workspaceId: 'project-1' })
  })
})
