import { join } from 'node:path'

import { migrate } from 'drizzle-orm/pglite/migrator'

import type { AppDatabaseConnection } from './connection'

export async function bootstrapDatabase(
  database: AppDatabaseConnection,
  migrationsFolder = join(process.cwd(), 'drizzle')
): Promise<void> {
  await migrate(database.db, {
    migrationsFolder,
    migrationsSchema: 'public',
    migrationsTable: '__drizzle_migrations'
  })
}
