import type {
  ChatAttachmentKind,
  ChatAttachmentRecord,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'

export type ChatDraftAttachment = ChatAttachmentRecord & {
  error?: string
  previewUrl?: string
  status: 'importing' | 'success' | 'error'
  kind: ChatAttachmentKind
}

export type ChatState = {
  activeSessionId: string | null
  activeTopicId: string | null
  activeThreadId: string | null
  activeOperationId: string | null
  sessions: SessionRecord[]
  topics: TopicRecord[]
  threads: ThreadRecord[]
  messages: MessageRecord[]
  messagesMap: Record<string, MessageRecord>
  messageIds: string[]
  draftAttachments: ChatDraftAttachment[]
  sessionsStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  topicsStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  threadsStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  messagesStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  createStatus: 'idle' | 'creating' | 'succeeded' | 'failed'
  sendStatus: 'idle' | 'sending' | 'succeeded' | 'failed'
  messagesRequestId: string | null
  streamingAssistantMessageId: string | null
  pendingToolInvocations: ToolInvocationRecord[]
  error: string | null
}
