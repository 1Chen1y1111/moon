import { z } from 'zod'

import { providerIdSchema } from './settings-validation'
import { chatAttachmentKinds, messageRoles, sessionStatuses } from './chat'

export const maxChatAttachmentSizeBytes = 10 * 1024 * 1024

export const maxChatAttachmentsPerMessage = 8

export const sessionStatusSchema = z.enum(sessionStatuses)

export const messageRoleSchema = z.enum(messageRoles)

export const chatAttachmentKindSchema = z.enum(chatAttachmentKinds)

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
  projectId: z.string().min(1).nullable(),
  provider: providerIdSchema,
  title: z.string(),
  status: sessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})

export const messageRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: messageRoleSchema,
  content: z.string(),
  attachments: chatAttachmentRecordSchema.array().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const getChatMessagesInputSchema = z.object({
  sessionId: z.string().trim().min(1, 'Session ID is required.')
})

export type GetChatMessagesInput = z.infer<typeof getChatMessagesInputSchema>

export const sendChatMessageInputSchema = z
  .object({
    sessionId: z.string().trim().min(1, 'Session ID is required.').optional(),
    provider: providerIdSchema.optional(),
    content: z.string().trim(),
    attachments: chatAttachmentRecordSchema.array().max(maxChatAttachmentsPerMessage).optional()
  })
  .refine(
    (input) => input.content.length > 0 || (input.attachments?.length ?? 0) > 0,
    'Message or attachment is required.'
  )

export type SendChatMessageInput = z.infer<typeof sendChatMessageInputSchema>
