import type { DatabaseConnection } from '../db/connection'
import { tableNames } from '../db/schema'
import type { ProjectRecord } from '../ipc/contracts'

const upsertProjectStatement = `
  INSERT INTO ${tableNames.projects} (id, path, name, created_at, updated_at)
  VALUES (@id, @path, @name, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    path = excluded.path,
    name = excluded.name,
    updated_at = excluded.updated_at
`

type ProjectRow = {
  id: string
  path: string
  name: string
  created_at: string
  updated_at: string
}

function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class ProjectsRepository {
  constructor(private readonly database: DatabaseConnection) {}

  list(): ProjectRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, path, name, created_at, updated_at FROM ${tableNames.projects} ORDER BY updated_at DESC`
      )
      .all() as ProjectRow[]

    return rows.map(mapProjectRow)
  }

  save(project: ProjectRecord): ProjectRecord {
    this.database.prepare(upsertProjectStatement).run(project)
    return project
  }
}
