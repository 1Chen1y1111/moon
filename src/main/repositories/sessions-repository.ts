import { desc, eq } from 'drizzle-orm'

import { sessionRecordSchema } from '@shared/domain/chat-validation'

import type { SessionRecord } from '../../shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { sessions } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class SessionsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async list(): Promise<SessionRecord[]> {
    const rows = await this.database.db.select().from(sessions).orderBy(desc(sessions.updatedAt))

    return rows.map(toSessionRecord)
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = await this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toSessionRecord(row)
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const parsedSession = sessionRecordSchema.parse(session)

    await this.database.db
      .insert(sessions)
      .values(parsedSession)
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          projectId: parsedSession.projectId,
          provider: parsedSession.provider,
          title: parsedSession.title,
          status: parsedSession.status,
          updatedAt: parsedSession.updatedAt
        }
      })

    return parsedSession
  }
}

function toSessionRecord(session: typeof sessions.$inferSelect): SessionRecord {
  return {
    ...session,
    createdAt: toIsoTimestamp(session.createdAt),
    updatedAt: toIsoTimestamp(session.updatedAt)
  }
}
