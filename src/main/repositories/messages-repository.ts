import { desc } from 'drizzle-orm'

import type { MessageRecord, MessageSearchResult } from '../../shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { messages } from '../db/schema'

export class MessagesRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  list(): MessageRecord[] {
    if (this.database.kind === 'better-sqlite3') {
      return this.database.db.select().from(messages).orderBy(desc(messages.createdAt)).all()
    }

    return this.database.client
      .prepare(
        'SELECT id, session_id AS sessionId, role, content, created_at AS createdAt, updated_at AS updatedAt FROM messages ORDER BY created_at DESC'
      )
      .all<MessageRecord>()
  }

  save(message: MessageRecord): MessageRecord {
    if (this.database.kind === 'better-sqlite3') {
      this.database.db
        .insert(messages)
        .values(message)
        .onConflictDoUpdate({
          target: messages.id,
          set: {
            sessionId: message.sessionId,
            role: message.role,
            content: message.content,
            updatedAt: message.updatedAt
          }
        })
        .run()
    } else {
      this.database.client
        .prepare(
          `
            INSERT INTO messages (id, session_id, role, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              session_id = excluded.session_id,
              role = excluded.role,
              content = excluded.content,
              updated_at = excluded.updated_at
          `
        )
        .run(
          message.id,
          message.sessionId,
          message.role,
          message.content,
          message.createdAt,
          message.updatedAt
        )
    }

    this.database.client.prepare('DELETE FROM messages_fts WHERE message_id = ?').run(message.id)
    this.database.client
      .prepare('INSERT INTO messages_fts (message_id, session_id, content) VALUES (?, ?, ?)')
      .run(message.id, message.sessionId, message.content)

    return message
  }

  search(query: string, limit = 20): MessageSearchResult[] {
    if (query.trim().length === 0) {
      return []
    }

    return this.database.client
      .prepare(
        `
          SELECT
            message_id AS messageId,
            session_id AS sessionId,
            content
          FROM messages_fts
          WHERE messages_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `
      )
      .all<MessageSearchResult>(query.trim(), limit)
  }
}
