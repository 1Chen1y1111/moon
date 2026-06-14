import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'

import { messageRecordSchema, toolInvocationRecordSchema } from '@moon/shared/domain/chat-validation'

import type {
  ChatJsonObject,
  MessageRecord,
  MessageSearchResult,
  ToolInvocationRecord,
  ToolInvocationStatus
} from '@moon/shared/domain/chat'
import { defaultChatUserId } from '@moon/shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { messagePlugins, messages } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class MessagesRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async list(): Promise<MessageRecord[]> {
    const rows = await this.database.db
      .select()
      .from(messages)
      .where(ne(messages.role, 'tool'))
      .orderBy(desc(messages.createdAt))

    return this.withToolInvocations(rows.map(toMessageRecord))
  }

  async listBySession(sessionId: string): Promise<MessageRecord[]> {
    const rows = await this.database.db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), ne(messages.role, 'tool')))
      .orderBy(asc(messages.createdAt))

    return this.withToolInvocations(rows.map(toMessageRecord))
  }

  async listByThread(threadId: string): Promise<MessageRecord[]> {
    const rows = await this.database.db
      .select()
      .from(messages)
      .where(and(eq(messages.threadId, threadId), ne(messages.role, 'tool')))
      .orderBy(asc(messages.createdAt))

    return this.withToolInvocations(rows.map(toMessageRecord))
  }

  async listByOperation(operationId: string): Promise<MessageRecord[]> {
    const rows = await this.database.db
      .select()
      .from(messages)
      .where(and(eq(messages.operationId, operationId), ne(messages.role, 'tool')))
      .orderBy(asc(messages.createdAt))

    return this.withToolInvocations(rows.map(toMessageRecord))
  }

  async save(message: MessageRecord): Promise<MessageRecord> {
    const parsedMessage = messageRecordSchema.parse(message)
    const { toolInvocations: _toolInvocations, ...messageWithoutTools } = parsedMessage
    void _toolInvocations
    const messageValues = {
      ...messageWithoutTools,
      attachments: parsedMessage.attachments ?? [],
      editorData: parsedMessage.editorData ?? null,
      summary: parsedMessage.summary ?? null,
      reasoning: parsedMessage.reasoning ?? null,
      search: parsedMessage.search ?? null,
      metadata: parsedMessage.metadata ?? null,
      favorite: parsedMessage.favorite ?? false,
      error: parsedMessage.error ?? null,
      tools: parsedMessage.tools ?? null,
      traceId: parsedMessage.traceId ?? null,
      observationId: parsedMessage.observationId ?? null,
      clientId: parsedMessage.clientId ?? parsedMessage.id,
      userId: parsedMessage.userId ?? defaultChatUserId,
      quotaId: parsedMessage.quotaId ?? null,
      agentId: parsedMessage.agentId ?? null,
      groupId: parsedMessage.groupId ?? null,
      targetId: parsedMessage.targetId ?? null,
      messageGroupId: parsedMessage.messageGroupId ?? null,
      parentId: parsedMessage.parentId ?? null,
      operationId: parsedMessage.operationId ?? null,
      provider: parsedMessage.provider ?? null,
      model: parsedMessage.model ?? null
    }

    await this.database.db
      .insert(messages)
      .values(messageValues)
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          sessionId: messageValues.sessionId,
          topicId: messageValues.topicId,
          threadId: messageValues.threadId,
          parentId: messageValues.parentId,
          operationId: messageValues.operationId,
          role: messageValues.role,
          content: messageValues.content,
          editorData: messageValues.editorData,
          summary: messageValues.summary,
          reasoning: messageValues.reasoning,
          search: messageValues.search,
          metadata: messageValues.metadata,
          favorite: messageValues.favorite,
          error: messageValues.error,
          tools: messageValues.tools,
          traceId: messageValues.traceId,
          observationId: messageValues.observationId,
          clientId: messageValues.clientId,
          userId: messageValues.userId,
          quotaId: messageValues.quotaId,
          agentId: messageValues.agentId,
          groupId: messageValues.groupId,
          targetId: messageValues.targetId,
          messageGroupId: messageValues.messageGroupId,
          status: messageValues.status,
          provider: messageValues.provider,
          model: messageValues.model,
          attachments: messageValues.attachments,
          updatedAt: messageValues.updatedAt
        }
      })

    return toMessageRecord(messageValues)
  }

  async search(query: string, limit = 20): Promise<MessageSearchResult[]> {
    const trimmedQuery = query.trim()

    if (trimmedQuery.length === 0) {
      return []
    }

    const result = await this.database.db.execute<MessageSearchResult>(sql`
      SELECT
        id AS "messageId",
        session_id AS "sessionId",
        thread_id AS "threadId",
        content
      FROM ${messages}
      WHERE to_tsvector('simple', ${messages.content}) @@ plainto_tsquery('simple', ${trimmedQuery})
      ORDER BY
        ts_rank(to_tsvector('simple', ${messages.content}), plainto_tsquery('simple', ${trimmedQuery})) DESC,
        created_at DESC
      LIMIT ${limit}
    `)

    return result.rows
  }

  private async withToolInvocations(records: MessageRecord[]): Promise<MessageRecord[]> {
    if (records.length === 0) {
      return records
    }

    const pluginRows = await this.database.db
      .select({
        plugin: messagePlugins,
        toolMessage: messages
      })
      .from(messagePlugins)
      .innerJoin(messages, eq(messagePlugins.id, messages.id))
      .where(
        inArray(
          messages.parentId,
          records.map((message) => message.id)
        )
      )
      .orderBy(asc(messages.createdAt))
    const invocationsByMessageId = new Map<string, ToolInvocationRecord[]>()

    for (const invocation of pluginRows.map((row) =>
      toToolInvocationRecord(row.plugin, row.toolMessage)
    )) {
      invocationsByMessageId.set(invocation.messageId, [
        ...(invocationsByMessageId.get(invocation.messageId) ?? []),
        invocation
      ])
    }

    return records.map((message) => {
      const messageToolInvocations = invocationsByMessageId.get(message.id)

      return messageToolInvocations === undefined
        ? message
        : { ...message, toolInvocations: messageToolInvocations }
    })
  }
}

function toMessageRecord(message: typeof messages.$inferSelect): MessageRecord {
  const {
    createdAt,
    editorData,
    error: storedError,
    metadata: storedMetadata,
    model,
    observationId,
    operationId,
    parentId,
    provider,
    quotaId,
    reasoning: storedReasoning,
    search,
    summary,
    threadId,
    tools,
    traceId,
    clientId,
    agentId,
    groupId,
    targetId,
    messageGroupId,
    updatedAt,
    ...messageRecord
  } = message
  const attachments = message.attachments ?? []
  const metadata = storedMetadata ?? {}
  const reasoning = normalizeOptionalString(storedReasoning)
  const error = normalizeOptionalString(storedError)

  return messageRecordSchema.parse({
    ...messageRecord,
    threadId,
    ...(editorData === null ? {} : { editorData }),
    ...(summary === null ? {} : { summary }),
    ...(reasoning === null ? {} : { reasoning }),
    ...(search === null ? {} : { search }),
    ...(error === null ? {} : { error }),
    ...(tools === null ? {} : { tools }),
    ...(traceId === null ? {} : { traceId }),
    ...(observationId === null ? {} : { observationId }),
    ...(clientId === null ? {} : { clientId }),
    ...(quotaId === null ? {} : { quotaId }),
    ...(agentId === null ? {} : { agentId }),
    ...(groupId === null ? {} : { groupId }),
    ...(targetId === null ? {} : { targetId }),
    ...(messageGroupId === null ? {} : { messageGroupId }),
    ...(parentId === null ? {} : { parentId }),
    ...(operationId === null ? {} : { operationId }),
    ...(provider === null ? {} : { provider }),
    ...(model === null ? {} : { model }),
    ...(isEmptyJsonObject(metadata) ? {} : { metadata }),
    ...(attachments.length === 0 ? {} : { attachments }),
    createdAt: toIsoTimestamp(createdAt),
    updatedAt: toIsoTimestamp(updatedAt)
  })
}

function toToolInvocationRecord(
  plugin: typeof messagePlugins.$inferSelect,
  toolMessage: typeof messages.$inferSelect
): ToolInvocationRecord {
  const state = plugin.state ?? {}
  const error = normalizeOptionalString(plugin.error ?? toolMessage.error)

  return toolInvocationRecordSchema.parse({
    id: plugin.toolCallId ?? plugin.id,
    pluginMessageId: plugin.id,
    toolCallId: plugin.toolCallId,
    operationId: toolMessage.operationId,
    messageId: toolMessage.parentId ?? toolMessage.id,
    name: plugin.apiName ?? plugin.identifier ?? 'tool',
    arguments: parseToolArguments(plugin.arguments),
    type: plugin.type,
    identifier: plugin.identifier,
    intervention: plugin.intervention,
    state,
    ...('result' in state ? { result: state.result } : {}),
    ...(error === null ? {} : { error }),
    status: normalizeToolStatus(state.status, toolMessage.status),
    userId: plugin.userId,
    clientId: plugin.clientId,
    createdAt: toIsoTimestamp(toolMessage.createdAt),
    updatedAt: toIsoTimestamp(toolMessage.updatedAt)
  })
}

function isEmptyJsonObject(value: ChatJsonObject): boolean {
  return Object.keys(value).length === 0
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    return value.length === 0 ? null : value
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return value.message
  }

  return JSON.stringify(value)
}

function parseToolArguments(value: string | null): ChatJsonObject {
  if (value === null || value.trim().length === 0) {
    return {}
  }

  const parsedValue: unknown = JSON.parse(value)

  if (typeof parsedValue === 'object' && parsedValue !== null && !Array.isArray(parsedValue)) {
    return parsedValue as ChatJsonObject
  }

  return { value: parsedValue }
}

function normalizeToolStatus(
  value: unknown,
  messageStatus: MessageRecord['status']
): ToolInvocationStatus {
  if (
    value === 'running' ||
    value === 'waiting_for_human' ||
    value === 'done' ||
    value === 'error' ||
    value === 'rejected'
  ) {
    return value
  }

  if (messageStatus === 'complete') {
    return 'done'
  }

  if (messageStatus === 'error') {
    return 'error'
  }

  return 'running'
}
