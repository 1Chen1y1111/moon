import type { ProviderId } from './provider'

export const sessionStatuses = ['active', 'archived'] as const

export type SessionStatus = (typeof sessionStatuses)[number]

export const messageRoles = ['user', 'assistant', 'system', 'tool'] as const

export type MessageRole = (typeof messageRoles)[number]

export const chatAttachmentKinds = ['image', 'file'] as const

export type ChatAttachmentKind = (typeof chatAttachmentKinds)[number]

export type ChatAttachmentRecord = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: ChatAttachmentKind
  createdAt: string
}

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
  attachments?: ChatAttachmentRecord[]
  createdAt: string
  updatedAt: string
}

export type SendMessageResult = {
  session: SessionRecord
  messages: MessageRecord[]
}

export type SendMessageEvent =
  | {
      type: 'user-message'
      session: SessionRecord
      message: MessageRecord
    }
  | {
      type: 'assistant-start'
      message: MessageRecord
    }
  | {
      type: 'assistant-delta'
      messageId: string
      delta: string
    }
  | {
      type: 'assistant-finish'
      session: SessionRecord
      message: MessageRecord
    }

export type MessageSearchResult = {
  messageId: string
  sessionId: string
  content: string
}
