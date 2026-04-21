import { desc } from 'drizzle-orm'

import type { ProjectRecord } from '../../shared/ipc/contracts'
import type { AppDatabaseConnection } from '../db/connection'
import { projects } from '../db/schema'

export class ProjectsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  list(): ProjectRecord[] {
    if (this.database.kind === 'better-sqlite3') {
      return this.database.db.select().from(projects).orderBy(desc(projects.updatedAt)).all()
    }

    return this.database.client
      .prepare(
        'SELECT id, path, name, created_at AS createdAt, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC'
      )
      .all<ProjectRecord>()
  }

  save(project: ProjectRecord): ProjectRecord {
    if (this.database.kind === 'better-sqlite3') {
      this.database.db
        .insert(projects)
        .values(project)
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            path: project.path,
            name: project.name,
            updatedAt: project.updatedAt
          }
        })
        .run()
    } else {
      this.database.client
        .prepare(
          `
            INSERT INTO projects (id, path, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              path = excluded.path,
              name = excluded.name,
              updated_at = excluded.updated_at
          `
        )
        .run(project.id, project.path, project.name, project.createdAt, project.updatedAt)
    }

    return project
  }
}
