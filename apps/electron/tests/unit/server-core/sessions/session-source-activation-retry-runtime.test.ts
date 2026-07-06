// @vitest-environment node

/**
 * 负责验证 SessionSourceActivationRetryRuntime 的 source activation 自动重发输入编排。
 * 测试只覆盖同 thread retry 输入形状，不触发完整 SessionManager 或真实 backend。
 */

import { describe, expect, it, vi } from 'vitest'

import type {
  AgentOperationRecord,
  MessageRecord,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import type { SendChatMessageInput } from '@moon/shared/domain/chat-validation'
import type { SessionEventRouteHint } from '@moon/server-core/sessions/handlers'
import type { SessionSourceProviderScope } from '@moon/server-core/sessions/session-agent-runtime'
import {
  SessionSourceActivationRetryRuntime,
  type SessionSourceActivationRetrySender
} from '@moon/server-core/sessions/session-source-activation-retry-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'

/**
 * 创建 retry runtime 测试需要的会话 scope。
 */
function createScope(project: ProjectRecord | null = createProject()): SessionSourceProviderScope {
  const session: SessionRecord = {
    id: 'session-1',
    projectId: project?.id ?? null,
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
 * 创建绑定到当前测试 workspace 的 project。
 */
function createProject(): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Moon',
    path: '/workspace/moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

/**
 * 创建触发 retry 的 operation，可按测试需要覆盖 provider 或 appContext。
 */
function createOperation(overrides: Partial<AgentOperationRecord> = {}): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1', llmConnectionId: 'connection-1' },
    provider: 'claude',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'done',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 sendMessage 返回值，runtime 本身不读取结果，只需要满足 sender contract。
 */
function createSendMessageResult(scope: SessionSourceProviderScope): SendMessageResult {
  const operation = createOperation({ id: 'retry-operation' })
  const message: MessageRecord = {
    id: 'retry-message',
    sessionId: scope.session.id,
    topicId: scope.topic.id,
    threadId: scope.thread.id,
    operationId: operation.id,
    role: 'assistant',
    content: 'retried',
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp
  }

  return {
    session: scope.session,
    topic: scope.topic,
    thread: scope.thread,
    operation,
    messages: [message]
  }
}

/**
 * 创建 runtime 和可断言的 sender spy。
 */
function createRuntimeFixture(scope = createScope()): {
  runtime: SessionSourceActivationRetryRuntime
  sendMessage: ReturnType<typeof vi.fn<SessionSourceActivationRetrySender>>
} {
  const sendMessage = vi.fn<SessionSourceActivationRetrySender>(async () =>
    createSendMessageResult(scope)
  )

  return {
    runtime: new SessionSourceActivationRetryRuntime({ sendMessage }),
    sendMessage
  }
}

describe('SessionSourceActivationRetryRuntime', () => {
  it('retries in the same thread with original message, project, provider, and connection', async () => {
    const scope = createScope()
    const { runtime, sendMessage } = createRuntimeFixture(scope)
    const onEvent = vi.fn()

    await runtime.run({
      onEvent,
      operation: createOperation(),
      scope,
      sourceActivation: {
        sourceSlug: 'linear',
        originalMessage: ' hello from user '
      }
    })

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(
      {
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        projectId: 'project-1',
        provider: 'claude',
        llmConnectionId: 'connection-1',
        content: ' hello from user '
      },
      onEvent
    )
  })

  it('falls back to session provider and omits llmConnectionId when operation does not provide them', async () => {
    const scope = createScope(null)
    const { runtime, sendMessage } = createRuntimeFixture(scope)

    await runtime.run({
      operation: createOperation({
        appContext: { sessionId: 'session-1' },
        provider: null
      }),
      scope,
      sourceActivation: {
        sourceSlug: 'workspace',
        originalMessage: 'retry me'
      }
    })

    const retryInput = sendMessage.mock.calls[0]?.[0] as SendChatMessageInput | undefined

    expect(retryInput).toEqual({
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      projectId: null,
      provider: 'claude',
      content: 'retry me'
    })
    expect(retryInput).not.toHaveProperty('llmConnectionId')
  })

  it('does not retry when source activation is absent or original message is unusable', async () => {
    const scope = createScope()
    const { runtime, sendMessage } = createRuntimeFixture(scope)
    const operation = createOperation()

    await runtime.run({
      operation,
      scope,
      sourceActivation: null
    })
    await runtime.run({
      operation,
      scope,
      sourceActivation: { sourceSlug: 'linear' }
    })
    await runtime.run({
      operation,
      scope,
      sourceActivation: {
        sourceSlug: 'linear',
        originalMessage: '   '
      }
    })

    expect(sendMessage).not.toHaveBeenCalled()
  })
})
