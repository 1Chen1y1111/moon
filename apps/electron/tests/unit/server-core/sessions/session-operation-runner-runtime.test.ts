// @vitest-environment node

/**
 * 负责验证 SessionOperationRunnerRuntime 的 runOperation 外层编排。
 * 测试只覆盖 scope 恢复、target 解析、lifecycle/execute/retry 串联，不重复 backend 事件消费。
 */

import { describe, expect, it, vi } from 'vitest'

import { createDefaultLlmConnection } from '@moon/shared/config'
import type {
  AgentOperationRecord,
  ChatOperationEvent,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import type { SessionEventRouteHint } from '@moon/server-core/sessions/handlers'
import type { SessionAgentTargetRuntime } from '@moon/server-core/sessions/session-agent-target-runtime'
import type { SessionSourceProviderScope } from '@moon/server-core/sessions/session-agent-runtime'
import type { SessionOperationLifecycleRuntime } from '@moon/server-core/sessions/session-operation-lifecycle-runtime'
import type { SessionOperationRuntime } from '@moon/server-core/sessions/session-operation-runtime'
import { SessionOperationRunnerRuntime } from '@moon/server-core/sessions/session-operation-runner-runtime'
import type { SessionSourceActivationSignal } from '@moon/server-core/sessions/session-agent-event-applier'
import type { SessionSourceActivationRetryRuntime } from '@moon/server-core/sessions/session-source-activation-retry-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'
const connection = {
  ...createDefaultLlmConnection('anthropic'),
  id: 'connection-1',
  name: 'Claude',
  apiKey: 'test-key'
}

type EventCall = [ChatOperationEvent, SessionEventRouteHint | undefined]

/**
 * 创建项目记录。
 */
function createProject(input: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Moon',
    path: '/workspace/moon',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input
  }
}

/**
 * 创建会话记录。
 */
function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    projectId: 'project-1',
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建话题记录。
 */
function createTopic(overrides: Partial<TopicRecord> = {}): TopicRecord {
  return {
    id: 'topic-1',
    sessionId: 'session-1',
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建线程记录。
 */
function createThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: 'thread-1',
    topicId: 'topic-1',
    title: '主线',
    type: 'standalone',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 operation 记录。
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
 * 创建 operation 关联消息。
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
 * 创建 runner runtime 测试使用的内存仓储和 fake runtime 协作者。
 */
function createRuntimeFixture(
  input: {
    executeError?: Error
    messages?: MessageRecord[]
    operation?: AgentOperationRecord | null
    projects?: ProjectRecord[]
    sessions?: SessionRecord[]
    sourceActivation?: SessionSourceActivationSignal | null
    threads?: ThreadRecord[]
    topics?: TopicRecord[]
  } = {}
): {
  events: EventCall[]
  execute: ReturnType<typeof vi.fn>
  lifecycleStart: ReturnType<typeof vi.fn>
  lifecycleRelease: ReturnType<typeof vi.fn>
  retryRun: ReturnType<typeof vi.fn>
  runtime: SessionOperationRunnerRuntime
  scope: SessionSourceProviderScope
  targetResolve: ReturnType<typeof vi.fn>
} {
  const project = createProject()
  const session = createSession()
  const topic = createTopic()
  const thread = createThread()
  const operation = input.operation === undefined ? createOperation() : input.operation
  const projects = new Map((input.projects ?? [project]).map((record) => [record.id, record]))
  const sessions = new Map((input.sessions ?? [session]).map((record) => [record.id, record]))
  const topics = new Map((input.topics ?? [topic]).map((record) => [record.id, record]))
  const threads = new Map((input.threads ?? [thread]).map((record) => [record.id, record]))
  const operations = new Map(operation === null ? [] : [[operation.id, operation]])
  const defaultMessages = [createMessage('user'), createMessage('assistant')]
  const messages = new Map((input.messages ?? defaultMessages).map((record) => [record.id, record]))
  const events: EventCall[] = []
  const scope: SessionSourceProviderScope = { project, session, topic, thread }
  const targetResolve = vi.fn(async () => ({
    connection,
    persistedLlmConnectionId: 'connection-1',
    providerId: 'claude',
    session
  }))
  const lifecycleStart = vi.fn(async ({ assistantMessage, operation: currentOperation }) => ({
    abortSignal: new AbortController().signal,
    assistantMessage: {
      ...assistantMessage,
      status: 'streaming'
    },
    operation: {
      ...currentOperation,
      status: 'running'
    }
  }))
  const lifecycleRelease = vi.fn()
  const resultOperation = createOperation({
    status: 'done',
    completionReason: 'done'
  })
  const resultMessages = [createMessage('user'), createMessage('assistant', { content: 'done' })]
  const execute = vi.fn(async () => {
    if (input.executeError !== undefined) {
      throw input.executeError
    }

    return {
      session,
      topic,
      thread,
      operation: resultOperation,
      messages: resultMessages,
      sourceActivation: input.sourceActivation ?? null
    }
  })
  const retryRun = vi.fn(async () => undefined)
  const runtime = new SessionOperationRunnerRuntime({
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (nextOperation) => {
        operations.set(nextOperation.id, nextOperation)

        return nextOperation
      }
    },
    agentTargetRuntime: {
      resolveOperationTarget: targetResolve
    } as unknown as SessionAgentTargetRuntime,
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
    operationLifecycleRuntime: {
      start: lifecycleStart,
      release: lifecycleRelease
    } as unknown as SessionOperationLifecycleRuntime,
    operationRuntime: {
      execute
    } as unknown as SessionOperationRuntime,
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
    sourceActivationRetryRuntime: {
      run: retryRun
    } as unknown as SessionSourceActivationRetryRuntime,
    threadsRepository: {
      findById: async (id) => threads.get(id) ?? null,
      listBySession: async () => [...threads.values()],
      listByTopic: async (topicId) =>
        [...threads.values()].filter((record) => record.topicId === topicId),
      save: async (nextThread) => {
        threads.set(nextThread.id, nextThread)

        return nextThread
      }
    },
    topicsRepository: {
      findById: async (id) => topics.get(id) ?? null,
      listBySession: async () => [...topics.values()],
      save: async (nextTopic) => {
        topics.set(nextTopic.id, nextTopic)

        return nextTopic
      }
    }
  })

  return {
    events,
    execute,
    lifecycleStart,
    lifecycleRelease,
    retryRun,
    runtime,
    scope,
    targetResolve
  }
}

describe('SessionOperationRunnerRuntime', () => {
  it('restores scope, resolves target, starts lifecycle, executes operation, and returns result', async () => {
    const fixture = createRuntimeFixture()
    const onEvent = (event: ChatOperationEvent, hint?: SessionEventRouteHint): void => {
      fixture.events.push([event, hint])
    }

    const result = await fixture.runtime.run({ operationId: 'operation-1', onEvent })

    expect(result.operation).toMatchObject({ id: 'operation-1', status: 'done' })
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(fixture.targetResolve).toHaveBeenCalledWith({
      operation: expect.objectContaining({ id: 'operation-1' }),
      session: expect.objectContaining({ id: 'session-1' })
    })
    expect(fixture.lifecycleStart).toHaveBeenCalledWith({
      assistantMessage: expect.objectContaining({ id: 'assistant-message-1' }),
      onEvent,
      operation: expect.objectContaining({ id: 'operation-1' }),
      routeHint: { workspaceId: 'project-1' }
    })
    expect(fixture.execute).toHaveBeenCalledWith({
      abortSignal: expect.any(AbortSignal),
      assistantMessage: expect.objectContaining({ status: 'streaming' }),
      connection,
      onEvent,
      operation: expect.objectContaining({ status: 'running' }),
      routeHint: { workspaceId: 'project-1' },
      scope: {
        project: expect.objectContaining({ id: 'project-1' }),
        session: expect.objectContaining({ id: 'session-1' }),
        topic: expect.objectContaining({ id: 'topic-1' }),
        thread: expect.objectContaining({ id: 'thread-1' })
      }
    })
    expect(fixture.lifecycleRelease).toHaveBeenCalledWith('operation-1')
  })

  it('throws when operation does not exist', async () => {
    const fixture = createRuntimeFixture({ operation: null })

    await expect(fixture.runtime.run({ operationId: 'missing-operation' })).rejects.toThrow(
      'Agent operation not found.'
    )
  })

  it('keeps context error semantics for incomplete or missing operation scope', async () => {
    const incompleteFixture = createRuntimeFixture({
      operation: createOperation({ appContext: {}, topicId: 'topic-1', threadId: 'thread-1' })
    })

    await expect(incompleteFixture.runtime.run({ operationId: 'operation-1' })).rejects.toThrow(
      'Agent operation context is incomplete.'
    )

    const missingScopeFixture = createRuntimeFixture({
      sessions: [],
      operation: createOperation()
    })

    await expect(missingScopeFixture.runtime.run({ operationId: 'operation-1' })).rejects.toThrow(
      'Agent operation context not found.'
    )

    const missingProjectFixture = createRuntimeFixture({
      projects: [],
      operation: createOperation()
    })

    await expect(missingProjectFixture.runtime.run({ operationId: 'operation-1' })).rejects.toThrow(
      'Project not found.'
    )
  })

  it('throws when operation messages are missing', async () => {
    const fixture = createRuntimeFixture({
      messages: [createMessage('user')]
    })

    await expect(fixture.runtime.run({ operationId: 'operation-1' })).rejects.toThrow(
      'Agent operation messages not found.'
    )
  })

  it('releases lifecycle when operation execution fails', async () => {
    const fixture = createRuntimeFixture({
      executeError: new Error('backend failed')
    })

    await expect(fixture.runtime.run({ operationId: 'operation-1' })).rejects.toThrow(
      'backend failed'
    )
    expect(fixture.lifecycleRelease).toHaveBeenCalledWith('operation-1')
  })

  it('delegates source activation retry after execution result', async () => {
    const sourceActivation: SessionSourceActivationSignal = {
      sourceSlug: 'linear',
      originalMessage: 'retry original'
    }
    const fixture = createRuntimeFixture({ sourceActivation })
    const onEvent = vi.fn()

    await fixture.runtime.run({ operationId: 'operation-1', onEvent })

    expect(fixture.retryRun).toHaveBeenCalledWith({
      onEvent,
      operation: expect.objectContaining({ id: 'operation-1', status: 'done' }),
      scope: {
        project: expect.objectContaining({ id: 'project-1' }),
        session: expect.objectContaining({ id: 'session-1' }),
        topic: expect.objectContaining({ id: 'topic-1' }),
        thread: expect.objectContaining({ id: 'thread-1' })
      },
      sourceActivation
    })
  })
})
