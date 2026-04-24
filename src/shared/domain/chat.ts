import type { ProviderId } from './provider'

export const sessionStatuses = ['active', 'archived'] as const

export type SessionStatus = (typeof sessionStatuses)[number]

export const messageRoles = ['user', 'assistant', 'system', 'tool'] as const

export type MessageRole = (typeof messageRoles)[number]

export type SessionRecord = {
  id: string
  projectId: string | null
  provider: ProviderId
  title: string
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

export type MessageRecord = {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  createdAt: string
  updatedAt: string
}

export type MessageSearchResult = {
  messageId: string
  sessionId: string
  content: string
}
