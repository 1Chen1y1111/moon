import { desc } from 'drizzle-orm'

import type { SessionRecord } from '../../shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { sessions } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class SessionsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async list(): Promise<SessionRecord[]> {
    const rows = await this.database.db.select().from(sessions).orderBy(desc(sessions.updatedAt))

    return rows.map((session) => ({
      ...session,
      createdAt: toIsoTimestamp(session.createdAt),
      updatedAt: toIsoTimestamp(session.updatedAt)
    }))
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    await this.database.db
      .insert(sessions)
      .values(session)
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          projectId: session.projectId,
          provider: session.provider,
          title: session.title,
          status: session.status,
          updatedAt: session.updatedAt
        }
      })

    return session
  }
}
