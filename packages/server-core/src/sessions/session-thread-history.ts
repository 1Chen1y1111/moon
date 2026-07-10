/**
 * 负责按 thread lineage 还原 Moon 本地消息历史。
 * 它只读取 thread/message 仓储，不创建分支或修改持久化状态。
 */

import type { MessageRecord, ThreadRecord } from '@moon/shared/domain/chat'
import type { MessagesRepositoryPort, ThreadsRepositoryPort } from './session-manager'

export type SessionThreadHistoryInput = {
  messagesRepository: Pick<MessagesRepositoryPort, 'listByThread'>
  thread: ThreadRecord
  threadsRepository: Pick<ThreadsRepositoryPort, 'findById'>
}

/**
 * 递归拼接祖先分支到 source message 的历史和当前 thread 消息，并拒绝损坏的 lineage。
 */
export async function listSessionThreadHistory({
  messagesRepository,
  thread,
  threadsRepository
}: SessionThreadHistoryInput): Promise<MessageRecord[]> {
  return listThreadHistory(messagesRepository, threadsRepository, thread, new Set())
}

/**
 * 沿 parentThreadId 向上读取历史；visited 用于阻止损坏数据形成循环引用。
 */
async function listThreadHistory(
  messagesRepository: Pick<MessagesRepositoryPort, 'listByThread'>,
  threadsRepository: Pick<ThreadsRepositoryPort, 'findById'>,
  thread: ThreadRecord,
  visited: Set<string>
): Promise<MessageRecord[]> {
  if (visited.has(thread.id)) {
    throw new Error('Chat thread lineage contains a cycle.')
  }

  const ownMessages = await messagesRepository.listByThread(thread.id)
  const parentThreadId = thread.parentThreadId ?? undefined
  const sourceMessageId = thread.sourceMessageId ?? undefined

  if (parentThreadId === undefined && sourceMessageId === undefined) {
    return ownMessages
  }

  if (parentThreadId === undefined || sourceMessageId === undefined) {
    throw new Error('Chat thread branch context is incomplete.')
  }

  const parentThread = await threadsRepository.findById(parentThreadId)

  if (parentThread === null) {
    throw new Error('Chat parent thread not found.')
  }

  const parentHistory = await listThreadHistory(
    messagesRepository,
    threadsRepository,
    parentThread,
    new Set([...visited, thread.id])
  )
  const sourceMessageIndex = parentHistory.findIndex((message) => message.id === sourceMessageId)

  if (sourceMessageIndex === -1) {
    throw new Error('Chat branch source message not found.')
  }

  return [...parentHistory.slice(0, sourceMessageIndex + 1), ...ownMessages]
}
