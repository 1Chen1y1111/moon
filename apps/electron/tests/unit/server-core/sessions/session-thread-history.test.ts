// @vitest-environment node

/**
 * 负责验证 thread lineage 到本地消息历史的还原规则。
 * 测试只使用内存记录，不创建 operation 或 backend。
 */

import { describe, expect, it } from 'vitest'

import { listSessionThreadHistory } from '@moon/server-core/sessions/session-thread-history'
import type { MessageRecord, ThreadRecord } from '@moon/shared/domain/chat'

const timestamp = '2026-05-09T00:00:00.000Z'

/**
 * 创建历史测试使用的 thread 记录。
 */
function createThread(id: string, input: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id,
    topicId: 'topic-1',
    title: id,
    type: 'continuation',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input
  }
}

/**
 * 创建历史测试使用的消息记录。
 */
function createMessage(id: string, threadId: string, role: MessageRecord['role']): MessageRecord {
  return {
    id,
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId,
    role,
    content: id,
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

describe('listSessionThreadHistory', () => {
  it('slices each ancestor at its source message and supports nested branches', async () => {
    const root = createThread('thread-root', { type: 'standalone' })
    const branch = createThread('thread-branch', {
      parentThreadId: root.id,
      sourceMessageId: 'root-assistant-1'
    })
    const nestedBranch = createThread('thread-nested', {
      parentThreadId: branch.id,
      sourceMessageId: 'branch-assistant'
    })
    const threads = new Map([root, branch, nestedBranch].map((thread) => [thread.id, thread]))
    const messages = [
      createMessage('root-user-1', root.id, 'user'),
      createMessage('root-assistant-1', root.id, 'assistant'),
      createMessage('root-user-2', root.id, 'user'),
      createMessage('root-assistant-2', root.id, 'assistant'),
      createMessage('branch-user', branch.id, 'user'),
      createMessage('branch-assistant', branch.id, 'assistant'),
      createMessage('nested-user', nestedBranch.id, 'user')
    ]

    const history = await listSessionThreadHistory({
      messagesRepository: {
        listByThread: async (threadId) =>
          messages.filter((message) => message.threadId === threadId)
      },
      thread: nestedBranch,
      threadsRepository: {
        findById: async (threadId) => threads.get(threadId) ?? null
      }
    })

    expect(history.map((message) => message.id)).toEqual([
      'root-user-1',
      'root-assistant-1',
      'branch-user',
      'branch-assistant',
      'nested-user'
    ])
  })

  it('rejects incomplete branch lineage', async () => {
    const thread = createThread('thread-broken', { parentThreadId: 'thread-root' })

    await expect(
      listSessionThreadHistory({
        messagesRepository: { listByThread: async () => [] },
        thread,
        threadsRepository: { findById: async () => null }
      })
    ).rejects.toThrow('Chat thread branch context is incomplete.')
  })
})
