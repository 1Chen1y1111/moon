export const tableNames = {
  settings: 'settings',
  projects: 'projects',
  sessions: 'sessions'
} as const

export const databaseSchemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS ${tableNames.settings} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS ${tableNames.projects} (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS ${tableNames.sessions} (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES ${tableNames.projects}(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `
] as const
