import { eq } from 'drizzle-orm'

import { agentOperationRecordSchema } from '@moon/shared/domain/chat-validation'

import { defaultChatUserId, type AgentOperationRecord } from '@moon/shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { agentOperations } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class AgentOperationsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async findById(id: string): Promise<AgentOperationRecord | null> {
    const row = await this.database.db
      .select()
      .from(agentOperations)
      .where(eq(agentOperations.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toAgentOperationRecord(row)
  }

  async save(operation: AgentOperationRecord): Promise<AgentOperationRecord> {
    const parsedOperation = agentOperationRecordSchema.parse(operation)
    const operationValues = normalizeAgentOperationRecord(parsedOperation)

    await this.database.db
      .insert(agentOperations)
      .values(operationValues)
      .onConflictDoUpdate({
        target: agentOperations.id,
        set: {
          userId: operationValues.userId,
          agentId: operationValues.agentId,
          topicId: operationValues.topicId,
          threadId: operationValues.threadId,
          taskId: operationValues.taskId,
          chatGroupId: operationValues.chatGroupId,
          parentOperationId: operationValues.parentOperationId,
          status: operationValues.status,
          completionReason: operationValues.completionReason,
          startedAt: operationValues.startedAt,
          completedAt: operationValues.completedAt,
          stepCount: operationValues.stepCount,
          maxSteps: operationValues.maxSteps,
          forceFinish: operationValues.forceFinish,
          interruption: operationValues.interruption,
          error: operationValues.error,
          totalCost: operationValues.totalCost,
          currency: operationValues.currency,
          totalInputTokens: operationValues.totalInputTokens,
          totalOutputTokens: operationValues.totalOutputTokens,
          totalTokens: operationValues.totalTokens,
          llmCalls: operationValues.llmCalls,
          toolCalls: operationValues.toolCalls,
          humanInterventions: operationValues.humanInterventions,
          processingTimeMs: operationValues.processingTimeMs,
          humanWaitingTimeMs: operationValues.humanWaitingTimeMs,
          cost: operationValues.cost,
          usage: operationValues.usage,
          costLimit: operationValues.costLimit,
          model: operationValues.model,
          provider: operationValues.provider,
          modelRuntimeConfig: operationValues.modelRuntimeConfig,
          trigger: operationValues.trigger,
          appContext: operationValues.appContext,
          traceS3Key: operationValues.traceS3Key,
          metadata: operationValues.metadata,
          updatedAt: operationValues.updatedAt
        }
      })

    return operationValues
  }
}

function toAgentOperationRecord(
  operation: typeof agentOperations.$inferSelect
): AgentOperationRecord {
  return agentOperationRecordSchema.parse({
    ...operation,
    ...(operation.startedAt === null ? {} : { startedAt: toIsoTimestamp(operation.startedAt) }),
    ...(operation.completedAt === null
      ? {}
      : { completedAt: toIsoTimestamp(operation.completedAt) }),
    createdAt: toIsoTimestamp(operation.createdAt),
    updatedAt: toIsoTimestamp(operation.updatedAt)
  })
}

function normalizeAgentOperationRecord(
  operation: AgentOperationRecord
): typeof agentOperations.$inferInsert {
  return {
    ...operation,
    userId: operation.userId ?? defaultChatUserId,
    agentId: operation.agentId ?? null,
    topicId: operation.topicId ?? null,
    threadId: operation.threadId ?? null,
    taskId: operation.taskId ?? null,
    chatGroupId: operation.chatGroupId ?? null,
    parentOperationId: operation.parentOperationId ?? null,
    completionReason: operation.completionReason ?? null,
    startedAt: operation.startedAt ?? null,
    completedAt: operation.completedAt ?? null,
    stepCount: operation.stepCount ?? null,
    maxSteps: operation.maxSteps ?? null,
    forceFinish: operation.forceFinish ?? null,
    interruption: operation.interruption ?? null,
    error: operation.error ?? null,
    totalCost: operation.totalCost ?? null,
    currency: operation.currency ?? 'USD',
    totalInputTokens: operation.totalInputTokens ?? null,
    totalOutputTokens: operation.totalOutputTokens ?? null,
    totalTokens: operation.totalTokens ?? null,
    llmCalls: operation.llmCalls ?? null,
    toolCalls: operation.toolCalls ?? null,
    humanInterventions: operation.humanInterventions ?? null,
    processingTimeMs: operation.processingTimeMs ?? null,
    humanWaitingTimeMs: operation.humanWaitingTimeMs ?? null,
    cost: operation.cost ?? null,
    usage: operation.usage ?? null,
    costLimit: operation.costLimit ?? null,
    model: operation.model ?? null,
    provider: operation.provider ?? null,
    modelRuntimeConfig: operation.modelRuntimeConfig ?? null,
    trigger: operation.trigger ?? 'chat',
    appContext: operation.appContext ?? null,
    traceS3Key: operation.traceS3Key ?? null,
    metadata: operation.metadata ?? {}
  }
}
