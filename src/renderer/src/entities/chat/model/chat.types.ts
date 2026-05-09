import type { MessageRecord, SessionRecord } from '@shared/domain/chat'

export type ChatState = {
  activeSessionId: string | null
  sessions: SessionRecord[]
  messages: MessageRecord[]
  sessionsStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  messagesStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  createStatus: 'idle' | 'creating' | 'succeeded' | 'failed'
  sendStatus: 'idle' | 'sending' | 'succeeded' | 'failed'
  messagesRequestId: string | null
  streamingAssistantMessageId: string | null
  error: string | null
}
