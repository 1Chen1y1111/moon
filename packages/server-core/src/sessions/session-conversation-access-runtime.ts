/**
 * 负责会话目录、消息读取和删除这类访问型操作。
 * 它只封装仓储读取/删除规则，不创建消息 turn、不启动 agent backend。
 */

import type {
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type {
  MessagesRepositoryPort,
  SessionsRepositoryPort,
  ThreadsRepositoryPort,
  TopicsRepositoryPort
} from './session-manager'

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
 * 管理聊天会话的只读访问和删除入口，保持 SessionManager 主体只做 façade 委托。
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
   * 读取指定线程消息；未传 threadId 时回退到会话默认线程。
   */
  async getMessages({
    sessionId,
    threadId
  }: SessionConversationMessagesInput): Promise<MessageRecord[]> {
    if (threadId !== undefined) {
      return this.messagesRepository.listByThread(threadId)
    }

    const thread = await this.getDefaultThread(sessionId)

    return thread === null ? [] : this.messagesRepository.listByThread(thread.id)
  }

  /**
   * 删除指定会话；当前 runtime 不额外清理附件目录或派生文件。
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionsRepository.deleteById(sessionId)
  }

  /**
   * 读取会话默认 thread，当前策略使用列表首项作为默认值。
   */
  private async getDefaultThread(sessionId: string): Promise<ThreadRecord | null> {
    const threads = await this.threadsRepository.listBySession(sessionId)

    return threads[0] ?? null
  }
}
