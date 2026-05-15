import { z } from 'zod'

import { providerIdSchema } from './settings-validation'
import {
  agentOperationCompletionReasons,
  agentOperationStatuses,
  chatAttachmentKinds,
  messageRoles,
  messageStatuses,
  sessionStatuses,
  sessionTypes,
  threadTypes,
  threadStatuses,
  topicModes,
  topicStatuses,
  toolInvocationStatuses
} from './chat'

export const maxChatAttachmentSizeBytes = 10 * 1024 * 1024

export const maxChatAttachmentsPerMessage = 8

export const sessionStatusSchema = z.enum(sessionStatuses)

export const sessionTypeSchema = z.enum(sessionTypes)

export const topicStatusSchema = z.enum(topicStatuses)

export const topicModeSchema = z.enum(topicModes)

export const messageRoleSchema = z.enum(messageRoles)

export const threadTypeSchema = z.enum(threadTypes)

export const threadStatusSchema = z.enum(threadStatuses)

export const messageStatusSchema = z.enum(messageStatuses)

export const agentOperationStatusSchema = z.enum(agentOperationStatuses)

export const agentOperationCompletionReasonSchema = z.enum(agentOperationCompletionReasons)

export const toolInvocationStatusSchema = z.enum(toolInvocationStatuses)

export const chatAttachmentKindSchema = z.enum(chatAttachmentKinds)

export const chatJsonObjectSchema = z.record(z.string(), z.unknown())

export const chatJsonValueSchema = z.unknown()

export const chatAttachmentRecordSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(maxChatAttachmentSizeBytes),
  kind: chatAttachmentKindSchema,
  createdAt: z.string()
})

function isArrayBufferLike(value: unknown): boolean {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value)
}

export const importChatAttachmentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(255),
    size: z.number().int().min(1).max(maxChatAttachmentSizeBytes),
    data: z.custom<ArrayBuffer | ArrayBufferView>(isArrayBufferLike, 'Attachment data is required.')
  })
  .superRefine((input, context) => {
    const byteLength =
      input.data instanceof ArrayBuffer ? input.data.byteLength : input.data.byteLength

    if (byteLength !== input.size) {
      context.addIssue({
        code: 'custom',
        path: ['data'],
        message: 'Attachment data size does not match metadata.'
      })
    }
  })

export type ImportChatAttachmentInput = z.infer<typeof importChatAttachmentInputSchema>

export const sessionRecordSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).max(100).optional(),
  projectId: z.string().min(1).nullable(),
  provider: providerIdSchema,
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  backgroundColor: z.string().nullable().optional(),
  type: sessionTypeSchema.nullable().optional(),
  status: sessionStatusSchema,
  userId: z.string().min(1).optional(),
  groupId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const topicRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1).nullable().optional(),
  title: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
  content: z.string().nullable().optional(),
  editorData: chatJsonValueSchema.optional(),
  agentId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  userId: z.string().min(1).optional(),
  clientId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  historySummary: z.string().nullable().optional(),
  metadata: chatJsonObjectSchema.optional(),
  trigger: z.string().nullable().optional(),
  mode: topicModeSchema.nullable().optional(),
  status: topicStatusSchema.nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const threadRecordSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  editorData: chatJsonValueSchema.optional(),
  type: threadTypeSchema,
  status: threadStatusSchema.nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  parentThreadId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  metadata: chatJsonObjectSchema.optional(),
  userId: z.string().min(1).optional(),
  lastActiveAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const agentOperationRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).optional(),
  agentId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  chatGroupId: z.string().nullable().optional(),
  parentOperationId: z.string().nullable().optional(),
  status: agentOperationStatusSchema,
  completionReason: agentOperationCompletionReasonSchema.nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  stepCount: z.number().int().nullable().optional(),
  maxSteps: z.number().int().nullable().optional(),
  forceFinish: z.boolean().nullable().optional(),
  interruption: z
    .object({
      canResume: z.boolean(),
      interruptedAt: z.string(),
      reason: z.string()
    })
    .nullable()
    .optional(),
  error: chatJsonObjectSchema.nullable().optional(),
  totalCost: z.string().nullable().optional(),
  currency: z.string().optional(),
  totalInputTokens: z.number().int().nullable().optional(),
  totalOutputTokens: z.number().int().nullable().optional(),
  totalTokens: z.number().int().nullable().optional(),
  llmCalls: z.number().int().nullable().optional(),
  toolCalls: z.number().int().nullable().optional(),
  humanInterventions: z.number().int().nullable().optional(),
  processingTimeMs: z.number().int().nullable().optional(),
  humanWaitingTimeMs: z.number().int().nullable().optional(),
  cost: chatJsonObjectSchema.nullable().optional(),
  usage: chatJsonObjectSchema.nullable().optional(),
  costLimit: chatJsonObjectSchema.nullable().optional(),
  model: z.string().nullable().optional(),
  provider: providerIdSchema.nullable().optional(),
  modelRuntimeConfig: chatJsonObjectSchema.nullable().optional(),
  trigger: z.string().nullable().optional(),
  appContext: chatJsonObjectSchema.nullable().optional(),
  traceS3Key: z.string().nullable().optional(),
  metadata: chatJsonObjectSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const toolInvocationRecordSchema = z.object({
  id: z.string().min(1),
  pluginMessageId: z.string().nullable().optional(),
  toolCallId: z.string().nullable().optional(),
  operationId: z.string().nullable().optional(),
  messageId: z.string().min(1),
  name: z.string().trim().min(1),
  arguments: chatJsonObjectSchema,
  type: z.string().nullable().optional(),
  identifier: z.string().nullable().optional(),
  intervention: chatJsonObjectSchema.nullable().optional(),
  state: chatJsonObjectSchema.nullable().optional(),
  result: chatJsonValueSchema.optional(),
  error: z.string().nullable().optional(),
  status: toolInvocationStatusSchema,
  userId: z.string().min(1).optional(),
  clientId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const messageRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  topicId: z.string().min(1),
  threadId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  operationId: z.string().nullable().optional(),
  role: messageRoleSchema,
  content: z.string(),
  editorData: chatJsonValueSchema.optional(),
  summary: z.string().nullable().optional(),
  reasoning: z.string().optional(),
  search: chatJsonValueSchema.optional(),
  error: z.string().nullable().optional(),
  status: messageStatusSchema,
  provider: providerIdSchema.nullable().optional(),
  model: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
  tools: z
    .object({
      id: z.string().min(1),
      apiName: z.string().nullable().optional(),
      arguments: chatJsonObjectSchema.optional(),
      error: z.string().nullable().optional(),
      identifier: z.string().nullable().optional(),
      result: chatJsonValueSchema.optional(),
      status: toolInvocationStatusSchema.optional(),
      type: z.string().nullable().optional()
    })
    .array()
    .optional(),
  traceId: z.string().nullable().optional(),
  observationId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  userId: z.string().min(1).optional(),
  quotaId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  messageGroupId: z.string().nullable().optional(),
  metadata: chatJsonObjectSchema.optional(),
  attachments: chatAttachmentRecordSchema.array().optional(),
  toolInvocations: toolInvocationRecordSchema.array().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const getChatMessagesInputSchema = z.object({
  sessionId: z.string().trim().min(1, 'Session ID is required.'),
  threadId: z.string().trim().min(1, 'Thread ID is required.').optional()
})

export type GetChatMessagesInput = z.infer<typeof getChatMessagesInputSchema>

export const listChatTopicsInputSchema = z.object({
  sessionId: z.string().trim().min(1, 'Session ID is required.')
})

export type ListChatTopicsInput = z.infer<typeof listChatTopicsInputSchema>

export const listChatThreadsInputSchema = z.object({
  topicId: z.string().trim().min(1, 'Topic ID is required.')
})

export type ListChatThreadsInput = z.infer<typeof listChatThreadsInputSchema>

export const sendChatMessageInputSchema = z
  .object({
    sessionId: z.string().trim().min(1, 'Session ID is required.').optional(),
    topicId: z.string().trim().min(1, 'Topic ID is required.').optional(),
    threadId: z.string().trim().min(1, 'Thread ID is required.').optional(),
    provider: providerIdSchema.optional(),
    content: z.string().trim(),
    attachments: chatAttachmentRecordSchema.array().max(maxChatAttachmentsPerMessage).optional()
  })
  .refine(
    (input) => input.content.length > 0 || (input.attachments?.length ?? 0) > 0,
    'Message or attachment is required.'
  )

export type SendChatMessageInput = z.infer<typeof sendChatMessageInputSchema>

export const cancelAgentOperationInputSchema = z.object({
  operationId: z.string().trim().min(1, 'Operation ID is required.')
})

export type CancelAgentOperationInput = z.infer<typeof cancelAgentOperationInputSchema>

export const approveToolCallInputSchema = z.object({
  toolInvocationId: z.string().trim().min(1, 'Tool invocation ID is required.')
})

export type ApproveToolCallInput = z.infer<typeof approveToolCallInputSchema>

export const rejectToolCallInputSchema = z.object({
  toolInvocationId: z.string().trim().min(1, 'Tool invocation ID is required.'),
  reason: z.string().trim().max(500).optional()
})

export type RejectToolCallInput = z.infer<typeof rejectToolCallInputSchema>
