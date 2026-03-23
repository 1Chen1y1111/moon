import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

type BetterSqlite3Module = typeof import('better-sqlite3')

const require = createRequire(import.meta.url)

type DatabaseParameters = [unknown[]] | unknown[]

export type DatabaseStatement = {
  get<T = unknown>(...parameters: DatabaseParameters): T | undefined
  all<T = unknown>(...parameters: DatabaseParameters): T[]
  run(...parameters: DatabaseParameters): unknown
}

export type DatabaseConnection = {
  exec: (sql: string) => void
  prepare: (sql: string) => DatabaseStatement
  transaction: <T>(callback: () => T) => () => T
  close: () => void
}

function normalizeParameters(parameters: DatabaseParameters): unknown[] {
  if (parameters.length === 1 && Array.isArray(parameters[0])) {
    return parameters[0]
  }

  return parameters
}

function createNodeSqliteStatement(statement: StatementSync): DatabaseStatement {
  return {
    get<T>(...parameters: DatabaseParameters): T | undefined {
      return statement.get(
        ...(normalizeParameters(parameters) as Parameters<StatementSync['get']>)
      ) as T | undefined
    },
    all<T>(...parameters: DatabaseParameters): T[] {
      return statement.all(
        ...(normalizeParameters(parameters) as Parameters<StatementSync['all']>)
      ) as T[]
    },
    run(...parameters: DatabaseParameters): unknown {
      return statement.run(...(normalizeParameters(parameters) as Parameters<StatementSync['run']>))
    }
  }
}

function createNodeSqliteConnection(filePath: string): DatabaseConnection {
  const database = new DatabaseSync(filePath)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA busy_timeout = 5000')

  return {
    exec: (sql) => database.exec(sql),
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

function createBetterSqliteConnection(filePath: string): DatabaseConnection {
  const BetterSqlite3 = require('better-sqlite3') as BetterSqlite3Module
  const database = new BetterSqlite3(filePath)

  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')

  return {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => database.prepare(sql),
    transaction: (callback) => database.transaction(callback),
    close: () => database.close()
  }
}

export function createDatabaseConnection(filePath: string): DatabaseConnection {
  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true })
  }

  try {
    return createBetterSqliteConnection(filePath)
  } catch {
    return createNodeSqliteConnection(filePath)
  }
}
