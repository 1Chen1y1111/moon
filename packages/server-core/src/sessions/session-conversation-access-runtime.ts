/**
 * 负责会话目录、消息读取、active thread 和删除这类访问型操作。
 * 它封装仓储访问与 thread lineage 规则，不创建消息 turn、不启动 agent backend。
 */

import type {
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import { selectMostRecentlyActiveThread } from '@moon/shared/domain/chat-thread'
import type {
  MessagesRepositoryPort,
  SessionsRepositoryPort,
  ThreadsRepositoryPort,
  TopicsRepositoryPort
} from './session-manager'
import { listSessionThreadHistory } from './session-thread-history'

export type SessionConversationAccessRuntimeInput = {
  messagesRepository: MessagesRepositoryPort
  sessionsRepository: SessionsRepositoryPort
  threadsRepository: ThreadsRepositoryPort
  topicsRepository: TopicsRepositoryPort
}

export type SessionConversationMessagesInput = {
  sessionId: string
  threadId?: string
}

/**
 * 管理聊天会话的访问、轻量活跃状态和删除入口，保持 SessionManager 主体只做 façade 委托。
 */
export class SessionConversationAccessRuntime {
  private readonly messagesRepository: MessagesRepositoryPort
  private readonly sessionsRepository: SessionsRepositoryPort
  private readonly threadsRepository: ThreadsRepositoryPort
  private readonly topicsRepository: TopicsRepositoryPort

  /**
   * 注入访问型操作所需的仓储端口。
   */
  constructor({
    messagesRepository,
    sessionsRepository,
    threadsRepository,
    topicsRepository
  }: SessionConversationAccessRuntimeInput) {
    this.messagesRepository = messagesRepository
    this.sessionsRepository = sessionsRepository
    this.threadsRepository = threadsRepository
    this.topicsRepository = topicsRepository
  }

  /**
   * 列出当前 runtime 可见的聊天会话。
   */
  listSessions(): Promise<SessionRecord[]> {
    return this.sessionsRepository.list()
  }

  /**
   * 按会话读取话题列表，调用边界止于仓储查询。
   */
  listTopics(sessionId: string): Promise<TopicRecord[]> {
    return this.topicsRepository.listBySession(sessionId)
  }

  /**
   * 按话题读取线程列表，用于 renderer 展示当前会话分支。
   */
  listThreads(topicId: string): Promise<ThreadRecord[]> {
    return this.threadsRepository.listByTopic(topicId)
  }

  /**
   * 持久化用户最后选择的 thread，供应用重启和默认消息读取恢复。
   */
  async activateThread(threadId: string): Promise<ThreadRecord> {
    const thread = await this.threadsRepository.findById(threadId)

    if (thread === null) {
      throw new Error('Chat thread not found.')
    }

    const timestamp = new Date().toISOString()

    return this.threadsRepository.save({
      ...thread,
      lastActiveAt: timestamp,
      updatedAt: timestamp
    })
  }

  /**
   * 读取指定线程的 lineage 消息投影；未传 threadId 时回退到会话默认线程。
   */
  async getMessages({
    sessionId,
    threadId
  }: SessionConversationMessagesInput): Promise<MessageRecord[]> {
    const thread =
      threadId === undefined
        ? await this.getDefaultThread(sessionId)
        : await this.threadsRepository.findById(threadId)

    if (thread === null) {
      return []
    }

    return listSessionThreadHistory({
      messagesRepository: this.messagesRepository,
      thread,
      threadsRepository: this.threadsRepository
    })
  }

  /**
   * 删除指定会话，并在级联删除前返回其 thread IDs 供上层释放运行态。
   * 当前 runtime 不额外清理附件目录或派生文件。
   */
  async deleteSession(sessionId: string): Promise<string[]> {
    const threads = await this.threadsRepository.listBySession(sessionId)

    await this.sessionsRepository.deleteById(sessionId)

    return threads.map((thread) => thread.id)
  }

  /**
   * 读取会话最近活跃 thread，使无显式 threadId 的调用与 renderer 恢复策略一致。
   */
  private async getDefaultThread(sessionId: string): Promise<ThreadRecord | null> {
    const threads = await this.threadsRepository.listBySession(sessionId)

    return selectMostRecentlyActiveThread(threads)
  }
}
