import { asc, desc, eq, sql } from 'drizzle-orm'

import { messageRecordSchema } from '@shared/domain/chat-validation'

import type { MessageRecord, MessageSearchResult } from '../../shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { messages } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class MessagesRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async list(): Promise<MessageRecord[]> {
    const rows = await this.database.db.select().from(messages).orderBy(desc(messages.createdAt))

    return rows.map(toMessageRecord)
  }

  async listBySession(sessionId: string): Promise<MessageRecord[]> {
    const rows = await this.database.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt))

    return rows.map(toMessageRecord)
  }

  async save(message: MessageRecord): Promise<MessageRecord> {
    const parsedMessage = messageRecordSchema.parse(message)
    const messageValues = {
      ...parsedMessage,
      attachments: parsedMessage.attachments ?? []
    }

    await this.database.db
      .insert(messages)
      .values(messageValues)
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          sessionId: messageValues.sessionId,
          role: messageValues.role,
          content: messageValues.content,
          attachments: messageValues.attachments,
          updatedAt: messageValues.updatedAt
        }
      })

    return toMessageRecord(messageValues)
  }

  async search(query: string, limit = 20): Promise<MessageSearchResult[]> {
    const trimmedQuery = query.trim()

    if (trimmedQuery.length === 0) {
      return []
    }

    const result = await this.database.db.execute<MessageSearchResult>(sql`
      SELECT
        id AS "messageId",
        session_id AS "sessionId",
        content
      FROM ${messages}
      WHERE to_tsvector('simple', ${messages.content}) @@ plainto_tsquery('simple', ${trimmedQuery})
      ORDER BY
        ts_rank(to_tsvector('simple', ${messages.content}), plainto_tsquery('simple', ${trimmedQuery})) DESC,
        created_at DESC
      LIMIT ${limit}
    `)

    return result.rows
  }
}

function toMessageRecord(message: typeof messages.$inferSelect): MessageRecord {
  const attachments = message.attachments ?? []

  return {
    ...message,
    ...(attachments.length === 0 ? {} : { attachments }),
    createdAt: toIsoTimestamp(message.createdAt),
    updatedAt: toIsoTimestamp(message.updatedAt)
  }
}
