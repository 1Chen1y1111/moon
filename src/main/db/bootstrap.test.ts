// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from './bootstrap'
import { createDatabaseConnection } from './connection'
import { databaseSchemaVersion } from './schema'

describe('bootstrapDatabase', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it('creates the current schema and sets the user version', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-bootstrap-'))
    tempDirectories.push(directoryPath)
    const connection = createDatabaseConnection(join(directoryPath, 'moon.sqlite'))

    bootstrapDatabase(connection)

    expect(connection.client.pragma('user_version', { simple: true })).toBe(databaseSchemaVersion)
    expect(
      connection.client
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provider_settings'"
        )
        .get()
    ).toBeTruthy()
    expect(
      connection.client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'")
        .get()
    ).toBeTruthy()

    connection.close()
  })

  it('rebuilds known tables when the stored schema version is stale', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-bootstrap-'))
    tempDirectories.push(directoryPath)
    const connection = createDatabaseConnection(join(directoryPath, 'moon.sqlite'))

    connection.client.exec('CREATE TABLE provider_settings (provider TEXT PRIMARY KEY)')
    connection.client.pragma('user_version = 0')

    bootstrapDatabase(connection)

    expect(connection.client.pragma('user_version', { simple: true })).toBe(databaseSchemaVersion)
    expect(
      connection.client
        .prepare(
          "SELECT name FROM pragma_table_info('provider_settings') WHERE name = 'encrypted_api_key'"
        )
        .get()
    ).toBeTruthy()

    connection.close()
  })
})
