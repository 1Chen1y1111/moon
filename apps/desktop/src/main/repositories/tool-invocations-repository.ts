import { randomUUID } from 'node:crypto'

import { eq, or } from 'drizzle-orm'

import { toolInvocationRecordSchema } from '@moon/shared/domain/chat-validation'

import type {
  ChatJsonObject,
  MessageStatus,
  MessageToolRecord,
  ToolInvocationRecord,
  ToolInvocationStatus
} from '@moon/shared/domain/chat'
import { defaultChatUserId } from '@moon/shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { messagePlugins, messages } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

type ToolPluginRow = {
  plugin: typeof messagePlugins.$inferSelect
  toolMessage: typeof messages.$inferSelect
}

export class ToolInvocationsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async findById(id: string): Promise<ToolInvocationRecord | null> {
    const row = await this.findPluginRow(id)

    return row === null ? null : toToolInvocationRecord(row.plugin, row.toolMessage)
  }

  async save(toolInvocation: ToolInvocationRecord): Promise<ToolInvocationRecord> {
    const parsedToolInvocation = toolInvocationRecordSchema.parse(toolInvocation)
    const parentMessage = await this.database.db
      .select()
      .from(messages)
      .where(eq(messages.id, parsedToolInvocation.messageId))
      .then((rows) => rows[0])

    if (parentMessage === undefined) {
      throw new Error('Tool parent message not found.')
    }

    const existingRow = await this.findPluginRow(parsedToolInvocation.id)
    const pluginMessageId =
      parsedToolInvocation.pluginMessageId ?? existingRow?.plugin.id ?? randomUUID()
    const operationId =
      parsedToolInvocation.operationId ??
      parentMessage.operationId ??
      existingRow?.toolMessage.operationId
    const toolMessage = normalizeToolMessage({
      parentMessage,
      parsedToolInvocation,
      pluginMessageId,
      operationId,
      createdAt: existingRow?.toolMessage.createdAt
    })
    const plugin = normalizeMessagePlugin({
      parsedToolInvocation,
      pluginMessageId,
      operationId,
      userId: parentMessage.userId
    })

    await this.database.db
      .insert(messages)
      .values(toolMessage)
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          content: toolMessage.content,
          error: toolMessage.error,
          operationId: toolMessage.operationId,
          status: toolMessage.status,
          updatedAt: toolMessage.updatedAt
        }
      })

    await this.database.db
      .insert(messagePlugins)
      .values(plugin)
      .onConflictDoUpdate({
        target: messagePlugins.id,
        set: {
          toolCallId: plugin.toolCallId,
          type: plugin.type,
          intervention: plugin.intervention,
          apiName: plugin.apiName,
          arguments: plugin.arguments,
          identifier: plugin.identifier,
          state: plugin.state,
          error: plugin.error,
          clientId: plugin.clientId,
          userId: plugin.userId
        }
      })

    await this.upsertAssistantTool(parentMessage, parsedToolInvocation)

    return toolInvocationRecordSchema.parse({
      ...parsedToolInvocation,
      pluginMessageId,
      toolCallId: plugin.toolCallId,
      operationId,
      messageId: parentMessage.id,
      state: plugin.state,
      userId: plugin.userId,
      clientId: plugin.clientId,
      createdAt: toIsoTimestamp(toolMessage.createdAt),
      updatedAt: toIsoTimestamp(toolMessage.updatedAt)
    })
  }

  private async findPluginRow(id: string): Promise<ToolPluginRow | null> {
    const row = await this.database.db
      .select({
        plugin: messagePlugins,
        toolMessage: messages
      })
      .from(messagePlugins)
      .innerJoin(messages, eq(messagePlugins.id, messages.id))
      .where(or(eq(messagePlugins.id, id), eq(messagePlugins.toolCallId, id)))
      .then((rows) => rows[0])

    return row ?? null
  }

  private async upsertAssistantTool(
    parentMessage: typeof messages.$inferSelect,
    toolInvocation: ToolInvocationRecord
  ): Promise<void> {
    const nextTools = upsertToolRecord(parentMessage.tools ?? [], {
      id: toolInvocation.id,
      apiName: toolInvocation.name,
      arguments: toolInvocation.arguments,
      error: toolInvocation.error ?? null,
      identifier: toolInvocation.identifier ?? toolInvocation.name,
      result: toolInvocation.result,
      status: toolInvocation.status,
      type: toolInvocation.type ?? 'default'
    })

    await this.database.db
      .update(messages)
      .set({
        tools: nextTools,
        updatedAt: toolInvocation.updatedAt
      })
      .where(eq(messages.id, parentMessage.id))
  }
}

function normalizeToolMessage({
  parentMessage,
  parsedToolInvocation,
  pluginMessageId,
  operationId,
  createdAt
}: {
  createdAt?: string
  operationId?: string | null
  parentMessage: typeof messages.$inferSelect
  parsedToolInvocation: ToolInvocationRecord
  pluginMessageId: string
}): typeof messages.$inferInsert {
  const error = parsedToolInvocation.error ?? null

  return {
    id: pluginMessageId,
    sessionId: parentMessage.sessionId,
    topicId: parentMessage.topicId,
    threadId: parentMessage.threadId,
    parentId: parsedToolInvocation.messageId,
    operationId: operationId ?? null,
    role: 'tool',
    content: createToolMessageContent(parsedToolInvocation),
    editorData: null,
    summary: null,
    reasoning: null,
    search: null,
    metadata: {
      toolCallId: parsedToolInvocation.id
    },
    favorite: false,
    error,
    tools: null,
    traceId: parentMessage.traceId,
    observationId: parentMessage.observationId,
    clientId: parsedToolInvocation.clientId ?? pluginMessageId,
    userId: parentMessage.userId ?? defaultChatUserId,
    quotaId: null,
    agentId: parentMessage.agentId,
    groupId: parentMessage.groupId,
    targetId: parentMessage.targetId,
    messageGroupId: parentMessage.messageGroupId,
    status: toMessageStatus(parsedToolInvocation.status),
    provider: parentMessage.provider,
    model: parentMessage.model,
    attachments: [],
    createdAt: createdAt ?? parsedToolInvocation.createdAt,
    updatedAt: parsedToolInvocation.updatedAt
  }
}

function normalizeMessagePlugin({
  parsedToolInvocation,
  pluginMessageId,
  operationId,
  userId
}: {
  operationId?: string | null
  parsedToolInvocation: ToolInvocationRecord
  pluginMessageId: string
  userId: string
}): typeof messagePlugins.$inferInsert {
  return {
    id: pluginMessageId,
    toolCallId: parsedToolInvocation.toolCallId ?? parsedToolInvocation.id,
    type: parsedToolInvocation.type ?? 'default',
    intervention: parsedToolInvocation.intervention ?? null,
    apiName: parsedToolInvocation.name,
    arguments: JSON.stringify(parsedToolInvocation.arguments),
    identifier: parsedToolInvocation.identifier ?? parsedToolInvocation.name,
    state: {
      ...(parsedToolInvocation.state ?? {}),
      assistantMessageId: parsedToolInvocation.messageId,
      operationId: operationId ?? null,
      result: parsedToolInvocation.result ?? null,
      status: parsedToolInvocation.status
    },
    error:
      parsedToolInvocation.error === undefined || parsedToolInvocation.error === null
        ? null
        : { message: parsedToolInvocation.error },
    clientId: parsedToolInvocation.clientId ?? parsedToolInvocation.id,
    userId
  }
}

function toToolInvocationRecord(
  plugin: typeof messagePlugins.$inferSelect,
  toolMessage: typeof messages.$inferSelect
): ToolInvocationRecord {
  const state = plugin.state ?? {}
  const result = state.result
  const error = resolvePluginError(plugin.error ?? toolMessage.error)

  return toolInvocationRecordSchema.parse({
    id: plugin.toolCallId ?? plugin.id,
    pluginMessageId: plugin.id,
    toolCallId: plugin.toolCallId,
    operationId: toolMessage.operationId,
    messageId: toolMessage.parentId ?? toolMessage.id,
    name: plugin.apiName ?? plugin.identifier ?? 'tool',
    arguments: parseArguments(plugin.arguments),
    type: plugin.type,
    identifier: plugin.identifier,
    intervention: plugin.intervention,
    state,
    ...(result === undefined ? {} : { result }),
    ...(error === null ? {} : { error }),
    status: resolveToolStatus(state.status, toolMessage.status),
    userId: plugin.userId,
    clientId: plugin.clientId,
    createdAt: toIsoTimestamp(toolMessage.createdAt),
    updatedAt: toIsoTimestamp(toolMessage.updatedAt)
  })
}

function parseArguments(value: string | null): ChatJsonObject {
  if (value === null || value.trim().length === 0) {
    return {}
  }

  const parsedValue: unknown = JSON.parse(value)

  if (typeof parsedValue === 'object' && parsedValue !== null && !Array.isArray(parsedValue)) {
    return parsedValue as ChatJsonObject
  }

  return { value: parsedValue }
}

function resolvePluginError(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    return value
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

function resolveToolStatus(value: unknown, messageStatus: MessageStatus): ToolInvocationStatus {
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

function toMessageStatus(status: ToolInvocationStatus): MessageStatus {
  if (status === 'done' || status === 'rejected') {
    return 'complete'
  }

  if (status === 'error') {
    return 'error'
  }

  return 'streaming'
}

function createToolMessageContent(toolInvocation: ToolInvocationRecord): string {
  if (toolInvocation.error !== undefined && toolInvocation.error !== null) {
    return toolInvocation.error
  }

  if (toolInvocation.result === undefined) {
    return ''
  }

  return typeof toolInvocation.result === 'string'
    ? toolInvocation.result
    : JSON.stringify(toolInvocation.result)
}

function upsertToolRecord(
  tools: MessageToolRecord[],
  tool: MessageToolRecord
): MessageToolRecord[] {
  const index = tools.findIndex((candidate) => candidate.id === tool.id)

  if (index === -1) {
    return [...tools, tool]
  }

  const nextTools = [...tools]
  nextTools[index] = tool

  return nextTools
}
