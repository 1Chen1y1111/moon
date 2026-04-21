import { desc } from 'drizzle-orm'

import type { SessionRecord } from '@ipc/contracts'
import type { AppDatabaseConnection } from '../db/connection'
import { sessions } from '../db/schema'

export class SessionsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  list(): SessionRecord[] {
    if (this.database.kind === 'better-sqlite3') {
      return this.database.db.select().from(sessions).orderBy(desc(sessions.updatedAt)).all()
    }

    return this.database.client
      .prepare(
        'SELECT id, project_id AS projectId, provider, title, status, created_at AS createdAt, updated_at AS updatedAt FROM sessions ORDER BY updated_at DESC'
      )
      .all<SessionRecord>()
  }

  save(session: SessionRecord): SessionRecord {
    if (this.database.kind === 'better-sqlite3') {
      this.database.db
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
        .run()
    } else {
      this.database.client
        .prepare(
          `
            INSERT INTO sessions (id, project_id, provider, title, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              project_id = excluded.project_id,
              provider = excluded.provider,
              title = excluded.title,
              status = excluded.status,
              updated_at = excluded.updated_at
          `
        )
        .run(
          session.id,
          session.projectId,
          session.provider,
          session.title,
          session.status,
          session.createdAt,
          session.updatedAt
        )
    }

    return session
  }
}
