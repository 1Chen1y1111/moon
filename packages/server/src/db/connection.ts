import { existsSync, mkdirSync, renameSync } from 'node:fs'

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

function isRecoverablePgliteOpenError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('Aborted()') ||
      error.message.includes('PGlite failed to initialize properly'))
  )
}

function backupCorruptDataDir(dataDir: string): string {
  const backupPrefix = `${dataDir}.corrupt-${Date.now()}`
  let backupDir = backupPrefix
  let suffix = 1

  while (existsSync(backupDir)) {
    backupDir = `${backupPrefix}-${suffix}`
    suffix += 1
  }

  renameSync(dataDir, backupDir)
  return backupDir
}

export async function createDatabaseConnection(dataDir: string): Promise<AppDatabaseConnection> {
  if (dataDir !== 'memory://') {
    mkdirSync(dataDir, { recursive: true })
  }

  let client: PGlite

  try {
    client = await PGlite.create({ dataDir })
  } catch (error) {
    if (dataDir === 'memory://' || !existsSync(dataDir) || !isRecoverablePgliteOpenError(error)) {
      throw error
    }

    const backupDir = backupCorruptDataDir(dataDir)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn(
      `PGlite data directory could not be opened (${errorMessage}). Moved it to ${backupDir} and created a new database.`
    )

    mkdirSync(dataDir, { recursive: true })
    client = await PGlite.create({ dataDir })
  }

  const db = drizzle({ client, schema })

  return {
    db,
    client,
    close: () => client.close()
  }
}
