import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'

import * as schema from './schema'

const require = createRequire(import.meta.url)

type BetterSqlite3Module = typeof import('better-sqlite3')

type DatabaseParameters = unknown[]

export type DatabaseStatement = {
  run: (...parameters: DatabaseParameters) => unknown
  get: <T = unknown>(...parameters: DatabaseParameters) => T | undefined
  all: <T = unknown>(...parameters: DatabaseParameters) => T[]
}

export type DatabaseClient = {
  exec: (sql: string) => unknown
  pragma: (source: string, options?: { simple?: boolean }) => unknown
  prepare: (sql: string) => DatabaseStatement
  transaction: <T>(callback: () => T) => () => T
  close: () => unknown
}

export type AppDatabase = BetterSQLite3Database<typeof schema>

export type BetterSqliteDatabaseConnection = {
  kind: 'better-sqlite3'
  db: AppDatabase
  client: DatabaseClient
  close: () => void
}

export type NodeSqliteDatabaseConnection = {
  kind: 'node-sqlite'
  client: DatabaseClient
  close: () => void
}

export type AppDatabaseConnection = BetterSqliteDatabaseConnection | NodeSqliteDatabaseConnection

function createBetterSqliteClient(client: Database): DatabaseClient {
  return {
    exec: (sql) => client.exec(sql),
    pragma: (source, options) => client.pragma(source, options),
    prepare: (sql) => client.prepare(sql) as DatabaseStatement,
    transaction: (callback) => client.transaction(callback),
    close: () => client.close()
  }
}

function createNodeSqliteStatement(statement: StatementSync): DatabaseStatement {
  return {
    run: (...parameters) => statement.run(...(parameters as Parameters<StatementSync['run']>)),
    get: <T>(...parameters: DatabaseParameters): T | undefined =>
      statement.get(...(parameters as Parameters<StatementSync['get']>)) as T | undefined,
    all: <T>(...parameters: DatabaseParameters): T[] =>
      statement.all(...(parameters as Parameters<StatementSync['all']>)) as T[]
  }
}

function createNodeSqliteClient(filePath: string): DatabaseClient {
  const database = new DatabaseSync(filePath)

  return {
    exec: (sql) => database.exec(sql),
    pragma: (source, options) => {
      if (source.includes('=')) {
        database.exec(`PRAGMA ${source}`)
        return undefined
      }

      const row = database.prepare(`PRAGMA ${source}`).get() as Record<string, unknown> | undefined

      if (options?.simple === true && row !== undefined) {
        return Object.values(row)[0]
      }

      return row
    },
    prepare: (sql) => createNodeSqliteStatement(database.prepare(sql)),
    transaction:
      <T>(callback: () => T) =>
      () => {
        database.exec('BEGIN')

        try {
          const result = callback()
          database.exec('COMMIT')
          return result
        } catch (error) {
          database.exec('ROLLBACK')
          throw error
        }
      },
    close: () => database.close()
  }
}

function createBetterSqliteConnection(filePath: string): BetterSqliteDatabaseConnection {
  const BetterSqlite3 = require('better-sqlite3') as BetterSqlite3Module
  const rawClient = new BetterSqlite3(filePath)
  const client = createBetterSqliteClient(rawClient)

  client.pragma('journal_mode = WAL')
  client.pragma('foreign_keys = ON')
  client.pragma('busy_timeout = 5000')

  return {
    kind: 'better-sqlite3',
    db: drizzle(rawClient, { schema }),
    client,
    close: () => {
      client.close()
    }
  }
}

function createNodeSqliteConnection(filePath: string): NodeSqliteDatabaseConnection {
  const client = createNodeSqliteClient(filePath)

  client.pragma('journal_mode = WAL')
  client.pragma('foreign_keys = ON')
  client.pragma('busy_timeout = 5000')

  return {
    kind: 'node-sqlite',
    client,
    close: () => {
      client.close()
    }
  }
}

export function createDatabaseConnection(filePath: string): AppDatabaseConnection {
  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true })
  }

  try {
    return createBetterSqliteConnection(filePath)
  } catch {
    return createNodeSqliteConnection(filePath)
  }
}
