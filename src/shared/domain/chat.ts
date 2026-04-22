import type { ProviderId } from './provider'

export type SessionRecord = {
  id: string
  projectId: string | null
  provider: ProviderId
  title: string
  status: string
  createdAt: string
  updatedAt: string
}

export type MessageRecord = {
  id: string
  sessionId: string
  role: string
  content: string
  createdAt: string
  updatedAt: string
}

export type MessageSearchResult = {
  messageId: string
  sessionId: string
  content: string
}
