// @vitest-environment node

/**
 * 负责验证 SessionConversationAccessRuntime 的会话访问型操作。
 * 测试只覆盖仓储委托和默认 thread 消息读取规则，不触发完整 SessionManager。
 */

import { describe, expect, it, vi } from 'vitest'

import type {
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import {
  SessionConversationAccessRuntime,
  type SessionConversationAccessRuntimeInput
} from '@moon/server-core/sessions/session-conversation-access-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'

/**
 * 创建会话记录。
 */
function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    projectId: null,
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
 * 创建消息记录。
 */
function createMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    role: 'user',
    content: 'hello',
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建访问 runtime 测试需要的内存仓储和 spy。
 */
function createRuntimeFixture(input: {
  messages?: MessageRecord[]
  sessions?: SessionRecord[]
  threads?: ThreadRecord[]
  topics?: TopicRecord[]
} = {}): {
  dependencies: SessionConversationAccessRuntimeInput
  runtime: SessionConversationAccessRuntime
} {
  const sessions = input.sessions ?? [createSession()]
  const topics = input.topics ?? [createTopic()]
  const threads = input.threads ?? [createThread()]
  const messages = input.messages ?? [createMessage()]
  const dependencies: SessionConversationAccessRuntimeInput = {
    messagesRepository: {
      listByOperation: vi.fn(async () => []),
      listByThread: vi.fn(async (threadId) =>
        messages.filter((message) => message.threadId === threadId)
      ),
      save: vi.fn(async (message) => message)
    },
    sessionsRepository: {
      list: vi.fn(async () => sessions),
      findById: vi.fn(async (id) => sessions.find((session) => session.id === id) ?? null),
      save: vi.fn(async (session) => session),
      deleteById: vi.fn(async () => undefined)
    },
    threadsRepository: {
      findById: vi.fn(async (id) => threads.find((thread) => thread.id === id) ?? null),
      listBySession: vi.fn(async (sessionId) =>
        threads.filter((thread) =>
          topics.some((topic) => topic.id === thread.topicId && topic.sessionId === sessionId)
        )
      ),
      listByTopic: vi.fn(async (topicId) =>
        threads.filter((thread) => thread.topicId === topicId)
      ),
      save: vi.fn(async (thread) => thread)
    },
    topicsRepository: {
      findById: vi.fn(async (id) => topics.find((topic) => topic.id === id) ?? null),
      listBySession: vi.fn(async (sessionId) =>
        topics.filter((topic) => topic.sessionId === sessionId)
      ),
      save: vi.fn(async (topic) => topic)
    }
  }

  return {
    dependencies,
    runtime: new SessionConversationAccessRuntime(dependencies)
  }
}

describe('SessionConversationAccessRuntime', () => {
  it('delegates session, topic, and thread list reads to repositories', async () => {
    const { dependencies, runtime } = createRuntimeFixture()

    await expect(runtime.listSessions()).resolves.toEqual([
      expect.objectContaining({ id: 'session-1' })
    ])
    await expect(runtime.listTopics('session-1')).resolves.toEqual([
      expect.objectContaining({ id: 'topic-1' })
    ])
    await expect(runtime.listThreads('topic-1')).resolves.toEqual([
      expect.objectContaining({ id: 'thread-1' })
    ])
    expect(dependencies.sessionsRepository.list).toHaveBeenCalledOnce()
    expect(dependencies.topicsRepository.listBySession).toHaveBeenCalledWith('session-1')
    expect(dependencies.threadsRepository.listByTopic).toHaveBeenCalledWith('topic-1')
  })

  it('reads messages directly from an explicit thread id', async () => {
    const message = createMessage({ id: 'message-2', threadId: 'thread-2' })
    const { dependencies, runtime } = createRuntimeFixture({
      messages: [createMessage(), message],
      threads: [createThread(), createThread({ id: 'thread-2' })]
    })

    await expect(
      runtime.getMessages({ sessionId: 'session-1', threadId: 'thread-2' })
    ).resolves.toEqual([message])
    expect(dependencies.messagesRepository.listByThread).toHaveBeenCalledWith('thread-2')
    expect(dependencies.threadsRepository.listBySession).not.toHaveBeenCalled()
  })

  it('falls back to the first session thread when thread id is omitted', async () => {
    const defaultThreadMessage = createMessage({ id: 'message-default', threadId: 'thread-1' })
    const { dependencies, runtime } = createRuntimeFixture({
      messages: [
        defaultThreadMessage,
        createMessage({ id: 'message-other', threadId: 'thread-2' })
      ],
      threads: [createThread({ id: 'thread-1' }), createThread({ id: 'thread-2' })]
    })

    await expect(runtime.getMessages({ sessionId: 'session-1' })).resolves.toEqual([
      defaultThreadMessage
    ])
    expect(dependencies.threadsRepository.listBySession).toHaveBeenCalledWith('session-1')
    expect(dependencies.messagesRepository.listByThread).toHaveBeenCalledWith('thread-1')
  })

  it('returns an empty list when the session has no default thread', async () => {
    const { dependencies, runtime } = createRuntimeFixture({ threads: [] })

    await expect(runtime.getMessages({ sessionId: 'session-1' })).resolves.toEqual([])
    expect(dependencies.messagesRepository.listByThread).not.toHaveBeenCalled()
  })

  it('delegates session deletion to the sessions repository', async () => {
    const { dependencies, runtime } = createRuntimeFixture()

    await expect(runtime.deleteSession('session-1')).resolves.toBeUndefined()
    expect(dependencies.sessionsRepository.deleteById).toHaveBeenCalledWith('session-1')
  })
})
