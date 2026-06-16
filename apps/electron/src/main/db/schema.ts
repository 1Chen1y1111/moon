/**
 * 负责定义 Electron 主进程本地数据库的 Drizzle schema。
 * 它只描述表结构和字段类型，不执行迁移、连接初始化或仓储逻辑。
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core'

import type {
  AgentOperationAppContext,
  AgentOperationCompletionReason,
  AgentOperationError,
  AgentOperationInterruption,
  AgentOperationStatus,
  ChatAttachmentRecord,
  ChatJsonObject,
  MessageRole,
  MessageStatus,
  MessageToolRecord,
  SessionStatus,
  SessionType,
  ThreadStatus,
  ThreadType,
  TopicMode,
  TopicStatus
} from '@moon/shared/domain/chat'
import type { AgentBackendProvider, CustomEndpointApi, ThinkingLevel } from '@moon/shared/config'
import type {
  ProviderId,
  ProviderApiFormat,
  ProviderModel,
  ProviderType
} from '@moon/shared/domain/provider'

export const tableNames = {
  settings: 'settings',
  providerSettings: 'provider_settings',
  llmConnections: 'llm_connections',
  projects: 'projects',
  sessions: 'sessions',
  topics: 'topics',
  threads: 'threads',
  agentOperations: 'agent_operations',
  messageGroups: 'message_groups',
  messages: 'messages',
  messagePlugins: 'message_plugins'
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

export const llmConnections = pgTable(
  'llm_connections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    providerId: text('provider_id').$type<ProviderId>(),
    backend: text('backend').notNull().$type<AgentBackendProvider>(),
    model: text('model').notNull(),
    apiKey: text('encrypted_api_key').notNull().default(''),
    baseUrl: text('base_url').notNull().default(''),
    customEndpoint: jsonb('custom_endpoint').$type<{ api: CustomEndpointApi }>(),
    enabled: boolean('enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    thinkingLevel: text('thinking_level').notNull().default('medium').$type<ThinkingLevel>(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    index('llm_connections_enabled_idx').on(table.enabled),
    index('llm_connections_is_default_idx').on(table.isDefault),
    index('llm_connections_provider_id_idx').on(table.providerId)
  ]
)

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
    slug: varchar('slug', { length: 100 }).notNull(),
    llmConnectionId: text('llm_connection_id').references(() => llmConnections.id, {
      onDelete: 'set null'
    }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    provider: text('provider').notNull().$type<ProviderId>(),
    title: text('title'),
    description: text('description'),
    avatar: text('avatar'),
    backgroundColor: text('background_color'),
    type: text('type').default('agent').$type<SessionType>(),
    status: text('status').notNull().$type<SessionStatus>(),
    userId: text('user_id').notNull(),
    groupId: text('group_id'),
    clientId: text('client_id'),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex('slug_user_id_unique').on(table.slug, table.userId),
    uniqueIndex('sessions_client_id_user_id_unique').on(table.clientId, table.userId),
    index('sessions_project_id_idx').on(table.projectId),
    index('sessions_llm_connection_id_idx').on(table.llmConnectionId),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_id_user_id_idx').on(table.id, table.userId),
    index('sessions_user_id_updated_at_idx').on(table.userId, table.updatedAt),
    index('sessions_group_id_idx').on(table.groupId)
  ]
)

export const topics = pgTable(
  'topics',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    title: text('title'),
    favorite: boolean('favorite').notNull().default(false),
    content: text('content'),
    editorData: jsonb('editor_data').$type<unknown>(),
    agentId: text('agent_id'),
    groupId: text('group_id'),
    userId: text('user_id').notNull(),
    clientId: text('client_id'),
    description: text('description'),
    historySummary: text('history_summary'),
    metadata: jsonb('metadata').$type<ChatJsonObject>(),
    trigger: text('trigger'),
    mode: text('mode').$type<TopicMode>(),
    status: text('status').$type<TopicStatus>(),
    completedAt: timestamp('completed_at', { mode: 'string', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex('topics_client_id_user_id_unique').on(table.clientId, table.userId),
    index('topics_user_id_idx').on(table.userId),
    index('topics_id_user_id_idx').on(table.id, table.userId),
    index('topics_session_id_idx').on(table.sessionId),
    index('topics_group_id_idx').on(table.groupId),
    index('topics_agent_id_idx').on(table.agentId),
    index('topics_trigger_idx').on(table.trigger),
    index('topics_status_idx').on(table.status),
    index('topics_user_id_completed_at_idx').on(table.userId, table.completedAt)
  ]
)

export const threads = pgTable(
  'threads',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    content: text('content'),
    editorData: jsonb('editor_data').$type<unknown>(),
    type: text('type').notNull().$type<ThreadType>(),
    status: text('status').$type<ThreadStatus>(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    sourceMessageId: text('source_message_id'),
    parentThreadId: text('parent_thread_id'),
    clientId: text('client_id'),
    agentId: text('agent_id'),
    groupId: text('group_id'),
    metadata: jsonb('metadata').$type<ChatJsonObject>(),
    userId: text('user_id').notNull(),
    lastActiveAt: timestamp('last_active_at', { mode: 'string', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex('threads_client_id_user_id_unique').on(table.clientId, table.userId),
    index('threads_user_id_idx').on(table.userId),
    index('threads_topic_id_idx').on(table.topicId),
    index('threads_type_idx').on(table.type),
    index('threads_agent_id_idx').on(table.agentId),
    index('threads_group_id_idx').on(table.groupId),
    index('threads_parent_thread_id_idx').on(table.parentThreadId)
  ]
)

export const agentOperations = pgTable(
  'agent_operations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    agentId: text('agent_id'),
    topicId: text('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    threadId: text('thread_id').references(() => threads.id, { onDelete: 'set null' }),
    taskId: text('task_id'),
    chatGroupId: text('chat_group_id'),
    parentOperationId: text('parent_operation_id'),
    status: text('status').notNull().$type<AgentOperationStatus>(),
    completionReason: text('completion_reason').$type<AgentOperationCompletionReason>(),
    startedAt: timestamp('started_at', { mode: 'string', withTimezone: true }),
    completedAt: timestamp('completed_at', { mode: 'string', withTimezone: true }),
    stepCount: integer('step_count'),
    maxSteps: integer('max_steps'),
    forceFinish: boolean('force_finish'),
    interruption: jsonb('interruption').$type<AgentOperationInterruption>(),
    error: jsonb('error').$type<AgentOperationError>(),
    totalCost: numeric('total_cost', { precision: 18, scale: 8 }),
    currency: text('currency').notNull().default('USD'),
    totalInputTokens: integer('total_input_tokens'),
    totalOutputTokens: integer('total_output_tokens'),
    totalTokens: integer('total_tokens'),
    llmCalls: integer('llm_calls'),
    toolCalls: integer('tool_calls'),
    humanInterventions: integer('human_interventions'),
    processingTimeMs: integer('processing_time_ms'),
    humanWaitingTimeMs: integer('human_waiting_time_ms'),
    cost: jsonb('cost').$type<ChatJsonObject>(),
    usage: jsonb('usage').$type<ChatJsonObject>(),
    costLimit: jsonb('cost_limit').$type<ChatJsonObject>(),
    model: text('model'),
    provider: text('provider').$type<ProviderId>(),
    modelRuntimeConfig: jsonb('model_runtime_config').$type<ChatJsonObject>(),
    trigger: text('trigger'),
    appContext: jsonb('app_context').$type<AgentOperationAppContext>(),
    traceS3Key: text('trace_s3_key'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<ChatJsonObject>(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    index('agent_operations_user_id_idx').on(table.userId),
    index('agent_operations_agent_id_idx').on(table.agentId),
    index('agent_operations_topic_id_idx').on(table.topicId),
    index('agent_operations_thread_id_idx').on(table.threadId),
    index('agent_operations_task_id_idx').on(table.taskId),
    index('agent_operations_chat_group_id_idx').on(table.chatGroupId),
    index('agent_operations_parent_operation_id_idx').on(table.parentOperationId),
    index('agent_operations_status_idx').on(table.status),
    index('agent_operations_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('agent_operations_metadata_idx').using('gin', table.metadata)
  ]
)

export const messageGroups = pgTable(
  'message_groups',
  {
    id: text('id').primaryKey(),
    topicId: text('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    parentGroupId: text('parent_group_id'),
    parentMessageId: text('parent_message_id'),
    title: text('title'),
    description: text('description'),
    type: text('type').$type<'parallel' | 'compression'>(),
    content: text('content'),
    editorData: jsonb('editor_data').$type<unknown>(),
    metadata: jsonb('metadata').$type<ChatJsonObject>(),
    clientId: text('client_id'),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex('message_groups_client_id_user_id_unique').on(table.clientId, table.userId),
    index('message_groups_user_id_idx').on(table.userId),
    index('message_groups_topic_id_idx').on(table.topicId),
    index('message_groups_type_idx').on(table.type),
    index('message_groups_parent_group_id_idx').on(table.parentGroupId),
    index('message_groups_parent_message_id_idx').on(table.parentMessageId)
  ]
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    operationId: text('operation_id').references(() => agentOperations.id, {
      onDelete: 'set null'
    }),
    role: text('role').notNull().$type<MessageRole>(),
    content: text('content').notNull(),
    editorData: jsonb('editor_data').$type<unknown>(),
    summary: text('summary'),
    reasoning: jsonb('reasoning').$type<unknown>(),
    search: jsonb('search').$type<unknown>(),
    metadata: jsonb('metadata').$type<ChatJsonObject>(),
    favorite: boolean('favorite').notNull().default(false),
    error: jsonb('error').$type<unknown>(),
    tools: jsonb('tools').$type<MessageToolRecord[]>(),
    traceId: text('trace_id'),
    observationId: text('observation_id'),
    clientId: text('client_id'),
    userId: text('user_id').notNull(),
    quotaId: text('quota_id'),
    agentId: text('agent_id'),
    groupId: text('group_id'),
    targetId: text('target_id'),
    messageGroupId: text('message_group_id').references(() => messageGroups.id, {
      onDelete: 'cascade'
    }),
    status: text('status').notNull().$type<MessageStatus>(),
    provider: text('provider').$type<ProviderId>(),
    model: text('model'),
    attachments: jsonb('attachments')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<ChatAttachmentRecord[]>(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull()
  },
  (table) => [
    index('messages_session_id_idx').on(table.sessionId),
    index('messages_topic_id_idx').on(table.topicId),
    index('messages_thread_id_idx').on(table.threadId),
    index('messages_parent_id_idx').on(table.parentId),
    index('messages_quota_id_idx').on(table.quotaId),
    index('messages_operation_id_idx').on(table.operationId),
    index('messages_user_id_idx').on(table.userId),
    index('messages_agent_id_idx').on(table.agentId),
    index('messages_group_id_idx').on(table.groupId),
    index('messages_message_group_id_idx').on(table.messageGroupId),
    uniqueIndex('message_client_id_user_unique').on(table.clientId, table.userId),
    index('messages_content_search_idx').using('gin', sql`to_tsvector('simple', ${table.content})`)
  ]
)

export const messagePlugins = pgTable(
  'message_plugins',
  {
    id: text('id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .primaryKey(),
    toolCallId: text('tool_call_id'),
    type: text('type').default('default'),
    intervention: jsonb('intervention').$type<ChatJsonObject>(),
    apiName: text('api_name'),
    arguments: text('arguments'),
    identifier: text('identifier'),
    state: jsonb('state').$type<ChatJsonObject>(),
    error: jsonb('error').$type<unknown>(),
    clientId: text('client_id'),
    userId: text('user_id').notNull()
  },
  (table) => [
    uniqueIndex('message_plugins_client_id_user_id_unique').on(table.clientId, table.userId),
    index('message_plugins_user_id_idx').on(table.userId),
    index('message_plugins_tool_call_id_idx').on(table.toolCallId)
  ]
)
