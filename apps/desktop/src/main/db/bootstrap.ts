import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { migrate } from 'drizzle-orm/pglite/migrator'

import type { AppDatabaseConnection } from './connection'

function getDefaultMigrationsFolder(): string {
  const cwdMigrationsFolder = join(process.cwd(), 'drizzle')

  if (existsSync(join(cwdMigrationsFolder, 'meta', '_journal.json'))) {
    return cwdMigrationsFolder
  }

  return join(process.cwd(), 'apps', 'desktop', 'drizzle')
}

export async function bootstrapDatabase(
  database: AppDatabaseConnection,
  migrationsFolder = getDefaultMigrationsFolder()
): Promise<void> {
  await migrate(database.db, {
    migrationsFolder,
    migrationsSchema: 'public',
    migrationsTable: '__drizzle_migrations'
  })
}
