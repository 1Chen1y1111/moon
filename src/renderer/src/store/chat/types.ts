import type {
  ChatAttachmentKind,
  ChatAttachmentRecord,
  MessageRecord,
  SessionRecord
} from '@shared/domain/chat'

export type ChatDraftAttachment = ChatAttachmentRecord & {
  error?: string
  previewUrl?: string
  status: 'importing' | 'success' | 'error'
  kind: ChatAttachmentKind
}

export type ChatState = {
  activeSessionId: string | null
  sessions: SessionRecord[]
  messages: MessageRecord[]
  draftAttachments: ChatDraftAttachment[]
  sessionsStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  messagesStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  createStatus: 'idle' | 'creating' | 'succeeded' | 'failed'
  sendStatus: 'idle' | 'sending' | 'succeeded' | 'failed'
  messagesRequestId: string | null
  streamingAssistantMessageId: string | null
  error: string | null
}
