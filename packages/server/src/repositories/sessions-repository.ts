/**
 * 负责聊天 session 记录的本地持久化读写。
 * 它只处理 sessions 表和领域对象转换，不创建 topic/thread 或访问 agent backend。
 */

import { randomUUID } from 'node:crypto'

import { desc, eq } from 'drizzle-orm'

import { sessionRecordSchema } from '@moon/shared/domain/chat-validation'

import { defaultChatUserId, type SessionRecord } from '@moon/shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { sessions } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

type PersistedSessionRecord = SessionRecord & {
  avatar: string | null
  backgroundColor: string | null
  clientId: string | null
  description: string | null
  groupId: string | null
  llmConnectionId: string | null
  pinned: boolean
  slug: string
  title: string | null
  type: NonNullable<SessionRecord['type']>
  userId: string
}

export class SessionsRepository {
  /**
   * 保存数据库连接，后续方法只通过该连接访问 sessions 表。
   */
  constructor(private readonly database: AppDatabaseConnection) {}

  /**
   * 按更新时间倒序列出所有聊天 session。
   */
  async list(): Promise<SessionRecord[]> {
    const rows = await this.database.db.select().from(sessions).orderBy(desc(sessions.updatedAt))

    return rows.map(toSessionRecord)
  }

  /**
   * 按 session id 查找单条记录，找不到时返回 null。
   */
  async findById(id: string): Promise<SessionRecord | null> {
    const row = await this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toSessionRecord(row)
  }

  /**
   * 删除指定 session，级联行为交给数据库外键处理。
   */
  async deleteById(id: string): Promise<void> {
    await this.database.db.delete(sessions).where(eq(sessions.id, id))
  }

  /**
   * 新增或更新 session，并补齐本地运行需要的默认字段。
   */
  async save(session: SessionRecord): Promise<SessionRecord> {
    const parsedSession = sessionRecordSchema.parse(session)
    const sessionValues = normalizeSessionRecord(parsedSession)

    await this.database.db
      .insert(sessions)
      .values(sessionValues)
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          slug: sessionValues.slug,
          llmConnectionId: sessionValues.llmConnectionId,
          projectId: sessionValues.projectId,
          provider: sessionValues.provider,
          title: sessionValues.title,
          description: sessionValues.description,
          avatar: sessionValues.avatar,
          backgroundColor: sessionValues.backgroundColor,
          type: sessionValues.type,
          status: sessionValues.status,
          userId: sessionValues.userId,
          groupId: sessionValues.groupId,
          clientId: sessionValues.clientId,
          pinned: sessionValues.pinned,
          updatedAt: sessionValues.updatedAt
        }
      })

    return sessionValues
  }
}

/**
 * 把数据库行转换成跨进程使用的 session 记录。
 */
function toSessionRecord(session: typeof sessions.$inferSelect): SessionRecord {
  return {
    ...session,
    createdAt: toIsoTimestamp(session.createdAt),
    updatedAt: toIsoTimestamp(session.updatedAt)
  }
}

/**
 * 生成本地 session slug，用于兼容上游会话模型里的唯一短标识。
 */
function createSessionSlug(): string {
  return randomUUID().slice(0, 8)
}

/**
 * 补齐 session 写库所需的非空字段和默认值。
 */
function normalizeSessionRecord(session: SessionRecord): PersistedSessionRecord {
  return {
    ...session,
    slug: session.slug ?? createSessionSlug(),
    llmConnectionId: session.llmConnectionId ?? null,
    title: session.title ?? null,
    description: session.description ?? null,
    avatar: session.avatar ?? null,
    backgroundColor: session.backgroundColor ?? null,
    type: session.type ?? 'agent',
    userId: session.userId ?? defaultChatUserId,
    groupId: session.groupId ?? null,
    clientId: session.clientId ?? session.id,
    pinned: session.pinned ?? false
  }
}
