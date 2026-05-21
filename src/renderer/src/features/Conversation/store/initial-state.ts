import type { ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import type { MessageRecord } from '@shared/domain/chat'

import type { ConversationContext, OperationState } from '../types'

export type ConversationState = {
  context: ConversationContext
  inputMessage: string
  messages: MessageRecord[]
  messagesInit: boolean
  onMessagesChange?: (messages: MessageRecord[], context: ConversationContext) => void
  operationState: OperationState
  runtimeInfo: ChatInputRuntimeInfo
  skipFetch?: boolean
}

export type CreateConversationStoreParams = {
  context: ConversationContext
  hasInitMessages?: boolean
  messages?: MessageRecord[]
  onMessagesChange?: (messages: MessageRecord[], context: ConversationContext) => void
  operationState?: OperationState
  skipFetch?: boolean
}

export function createInitialConversationState({
  context,
  hasInitMessages,
  messages = [],
  onMessagesChange,
  operationState = {
    blockingOperationId: null,
    error: null,
    isSending: false
  },
  skipFetch
}: CreateConversationStoreParams): ConversationState {
  return {
    context,
    inputMessage: '',
    messages,
    messagesInit: skipFetch === true || hasInitMessages === true || messages.length > 0,
    onMessagesChange,
    operationState,
    runtimeInfo: {},
    skipFetch
  }
}
