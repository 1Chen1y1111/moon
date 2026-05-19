import type { MessageRecord } from '@shared/domain/chat'

export interface ConversationProps {
  className?: string
  isLoading?: boolean
  messages: MessageRecord[]
  showWelcome?: boolean
}
