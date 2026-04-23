import { mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'

import * as schema from './schema'

export type AppDatabase = PgliteDatabase<typeof schema> & {
  $client: PGlite
}

export type AppDatabaseConnection = {
  db: AppDatabase
  client: PGlite
  close: () => Promise<void>
}

export async function createDatabaseConnection(dataDir: string): Promise<AppDatabaseConnection> {
  if (dataDir !== 'memory://') {
    mkdirSync(dataDir, { recursive: true })
  }

  const client = await PGlite.create({ dataDir })
  const db = drizzle({ client, schema })

  return {
    db,
    client,
    close: () => client.close()
  }
}
