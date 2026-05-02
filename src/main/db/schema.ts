import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import type { MessageRole, SessionStatus } from '../../shared/domain/chat'
import type {
  ProviderId,
  ProviderApiFormat,
  ProviderModel,
  ProviderType
} from '../../shared/domain/provider'

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
  name: text('name').notNull().default(''),
  providerType: text('provider_type').notNull().default('custom').$type<ProviderType>(),
  model: text('model').notNull(),
  models: jsonb('models')
    .notNull()
    .default(sql`'[]'::jsonb`)
    .$type<ProviderModel[]>(),
  availableModels: jsonb('available_models')
    .notNull()
    .default(sql`'[]'::jsonb`)
    .$type<ProviderModel[]>(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('encrypted_api_key').notNull(),
  apiFormat: text('api_format').notNull().default('openai-chat').$type<ProviderApiFormat>(),
  useMaxCompletionTokens: boolean('use_max_completion_tokens').notNull().default(false),
  customHeaders: text('custom_headers').notNull().default(''),
  enabled: boolean('enabled').notNull().default(false),
  isCustom: boolean('is_custom').notNull().default(false),
  isAcp: boolean('is_acp').notNull().default(false),
  isOauth: boolean('is_oauth').notNull().default(false),
  acpCommand: text('acp_command').notNull().default(''),
  acpArgs: jsonb('acp_args')
    .notNull()
    .default(sql`'[]'::jsonb`)
    .$type<string[]>(),
  acpAuthMethodId: text('acp_auth_method_id').notNull().default(''),
  modelsUpdatedAt: timestamp('models_updated_at', { mode: 'string', withTimezone: true }),
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
    status: text('status').notNull().$type<SessionStatus>(),
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
    role: text('role').notNull().$type<MessageRole>(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    index('messages_session_id_idx').on(table.sessionId),
    index('messages_content_search_idx').using('gin', sql`to_tsvector('simple', ${table.content})`)
  ]
)
