import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { ProviderId } from '@ipc/contracts'

export const databaseSchemaVersion = 1

export const tableNames = {
  settings: 'settings',
  providerSettings: 'provider_settings',
  projects: 'projects',
  sessions: 'sessions',
  messages: 'messages',
  messagesFts: 'messages_fts'
} as const

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const providerSettings = sqliteTable('provider_settings', {
  provider: text('provider').primaryKey().$type<ProviderId>(),
  model: text('model').notNull(),
  baseUrl: text('base_url').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    provider: text('provider').notNull().$type<ProviderId>(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [index('sessions_project_id_idx').on(table.projectId)]
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [index('messages_session_id_idx').on(table.sessionId)]
)

export const databaseSchemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS ${tableNames.settings} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS ${tableNames.providerSettings} (
      provider TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      base_url TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
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
  `,
  `
    CREATE INDEX IF NOT EXISTS sessions_project_id_idx
    ON ${tableNames.sessions} (project_id)
  `,
  `
    CREATE TABLE IF NOT EXISTS ${tableNames.messages} (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES ${tableNames.sessions}(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS messages_session_id_idx
    ON ${tableNames.messages} (session_id)
  `,
  `
    CREATE VIRTUAL TABLE IF NOT EXISTS ${tableNames.messagesFts}
    USING fts5(message_id UNINDEXED, session_id UNINDEXED, content)
  `
] as const

export const databaseDropStatements = [
  `DROP TABLE IF EXISTS ${tableNames.messagesFts}`,
  `DROP TABLE IF EXISTS ${tableNames.messages}`,
  `DROP TABLE IF EXISTS ${tableNames.sessions}`,
  `DROP TABLE IF EXISTS ${tableNames.projects}`,
  `DROP TABLE IF EXISTS ${tableNames.providerSettings}`,
  `DROP TABLE IF EXISTS ${tableNames.settings}`
] as const
