import type { AppDatabaseConnection } from './connection'
import { databaseDropStatements, databaseSchemaStatements, databaseSchemaVersion } from './schema'

function readUserVersion(database: AppDatabaseConnection): number {
  const version = database.client.pragma('user_version', { simple: true })

  return Number(version)
}

export function bootstrapDatabase(database: AppDatabaseConnection): void {
  const bootstrap = database.client.transaction(() => {
    const userVersion = readUserVersion(database)

    if (userVersion !== databaseSchemaVersion) {
      for (const statement of databaseDropStatements) {
        database.client.exec(statement)
      }
    }

    for (const statement of databaseSchemaStatements) {
      database.client.exec(statement)
    }

    database.client.pragma(`user_version = ${databaseSchemaVersion}`)
  })

  bootstrap()
}
