import type { DatabaseConnection } from '../db/connection'
import { tableNames } from '../db/schema'
import type { SessionRecord } from '../ipc/contracts'

const upsertSessionStatement = `
  INSERT INTO ${tableNames.sessions} (id, project_id, provider, title, status, created_at, updated_at)
  VALUES (@id, @projectId, @provider, @title, @status, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    project_id = excluded.project_id,
    provider = excluded.provider,
    title = excluded.title,
    status = excluded.status,
    updated_at = excluded.updated_at
`

type SessionRow = {
  id: string
  project_id: string | null
  provider: SessionRecord['provider']
  title: string
  status: string
  created_at: string
  updated_at: string
}

function mapSessionRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    provider: row.provider,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class SessionsRepository {
  constructor(private readonly database: DatabaseConnection) {}

  list(): SessionRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, project_id, provider, title, status, created_at, updated_at FROM ${tableNames.sessions} ORDER BY updated_at DESC`
      )
      .all() as SessionRow[]

    return rows.map(mapSessionRow)
  }

  save(session: SessionRecord): SessionRecord {
    this.database.prepare(upsertSessionStatement).run(session)
    return session
  }
}
