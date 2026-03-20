import type { DatabaseConnection } from './connection'
import { databaseSchemaStatements } from './schema'

export function bootstrapDatabase(database: DatabaseConnection): void {
  const bootstrap = database.transaction(() => {
    for (const statement of databaseSchemaStatements) {
      database.exec(statement)
    }
  })

  bootstrap()
}
