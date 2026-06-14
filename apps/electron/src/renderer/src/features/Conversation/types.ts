import type { MessageRecord } from '@moon/shared/domain/chat'

export interface ConversationContext {
  draftProviderId: string | null
  sessionId: string | null
  threadId: string | null
  topicId: string | null
}

export interface OperationState {
  blockingOperationId: string | null
  error: string | null
  isSending: boolean
}

export interface ChatListProps {
  className?: string
  isLoading?: boolean
  messages?: MessageRecord[]
  showWelcome?: boolean
}

export type ConversationProps = ChatListProps
