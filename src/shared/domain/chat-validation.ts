import { z } from 'zod'

import { providerIdSchema } from './settings-validation'
import { messageRoles, sessionStatuses } from './chat'

export const sessionStatusSchema = z.enum(sessionStatuses)

export const messageRoleSchema = z.enum(messageRoles)

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
  createdAt: z.string(),
  updatedAt: z.string()
})
