import { desc, sql } from 'drizzle-orm'

import { messageRecordSchema } from '@shared/domain/chat-validation'

import type { MessageRecord, MessageSearchResult } from '../../shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { messages } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class MessagesRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async list(): Promise<MessageRecord[]> {
    const rows = await this.database.db.select().from(messages).orderBy(desc(messages.createdAt))

    return rows.map((message) => ({
      ...message,
      createdAt: toIsoTimestamp(message.createdAt),
      updatedAt: toIsoTimestamp(message.updatedAt)
    }))
  }

  async save(message: MessageRecord): Promise<MessageRecord> {
    const parsedMessage = messageRecordSchema.parse(message)

    await this.database.db
      .insert(messages)
      .values(parsedMessage)
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          sessionId: parsedMessage.sessionId,
          role: parsedMessage.role,
          content: parsedMessage.content,
          updatedAt: parsedMessage.updatedAt
        }
      })

    return parsedMessage
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
