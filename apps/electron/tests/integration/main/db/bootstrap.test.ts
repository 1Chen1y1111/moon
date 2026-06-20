// @vitest-environment node

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@moon/server/db/bootstrap'
import { createDatabaseConnection } from '@moon/server/db/connection'

const pgliteTestTimeout = 30_000

describe('bootstrapDatabase', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it(
    'runs PGlite migrations and records them in the public migration table',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-bootstrap-'))
      tempDirectories.push(directoryPath)
      const connection = await createDatabaseConnection(join(directoryPath, 'moon-pglite'))

      await bootstrapDatabase(connection)

      const providerTables = await connection.client.query<{ table_name: string }>(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'provider_settings'
      `
      )
      const migrationTables = await connection.client.query<{ table_name: string }>(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
      `
      )

      expect(providerTables.rows).toEqual([{ table_name: 'provider_settings' }])
      expect(migrationTables.rows).toEqual([{ table_name: '__drizzle_migrations' }])

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'can run migrations repeatedly without dropping existing PGlite data',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-bootstrap-'))
      tempDirectories.push(directoryPath)
      const connection = await createDatabaseConnection(join(directoryPath, 'moon-pglite'))

      await bootstrapDatabase(connection)
      await connection.client.query(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)',
        ['appearance.theme', 'dark', '2026-04-21T00:00:00.000Z']
      )
      await bootstrapDatabase(connection)

      const settings = await connection.client.query<{ value: string }>(
        'SELECT value FROM settings WHERE key = $1',
        ['appearance.theme']
      )

      expect(settings.rows).toEqual([{ value: 'dark' }])

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'backs up and recreates a PGlite data directory that cannot be opened',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-bootstrap-'))
      tempDirectories.push(directoryPath)
      const databasePath = join(directoryPath, 'moon-pglite')

      mkdirSync(databasePath, { recursive: true })
      writeFileSync(join(databasePath, 'PG_VERSION'), '17\n')

      const connection = await createDatabaseConnection(databasePath)
      await bootstrapDatabase(connection)

      const providerTables = await connection.client.query<{ table_name: string }>(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'provider_settings'
      `
      )
      const backups = readdirSync(directoryPath).filter((entry) =>
        entry.startsWith('moon-pglite.corrupt-')
      )

      expect(providerTables.rows).toEqual([{ table_name: 'provider_settings' }])
      expect(backups).toHaveLength(1)

      await connection.close()
    },
    pgliteTestTimeout
  )
})
