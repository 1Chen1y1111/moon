import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import type { ProviderId } from '../../shared/domain/provider'

export const tableNames = {
  settings: 'settings',
  providerSettings: 'provider_settings',
  projects: 'projects',
  sessions: 'sessions',
  messages: 'messages'
} as const

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
})

export const providerSettings = pgTable('provider_settings', {
  provider: text('provider').primaryKey().$type<ProviderId>(),
  model: text('model').notNull(),
  baseUrl: text('base_url').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
})

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
})

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    provider: text('provider').notNull().$type<ProviderId>(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [index('sessions_project_id_idx').on(table.projectId)]
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    index('messages_session_id_idx').on(table.sessionId),
    index('messages_content_search_idx').using('gin', sql`to_tsvector('simple', ${table.content})`)
  ]
)
