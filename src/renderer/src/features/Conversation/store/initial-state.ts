import type { ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import type { MessageRecord } from '@shared/domain/chat'

import type { ConversationContext, OperationState } from '../types'

export type ConversationState = {
  context: ConversationContext
  inputMessage: string
  messages: MessageRecord[]
  operationState: OperationState
  runtimeInfo: ChatInputRuntimeInfo
}

export type CreateConversationStoreParams = {
  context: ConversationContext
  messages?: MessageRecord[]
  operationState?: OperationState
}

export function createInitialConversationState({
  context,
  messages = [],
  operationState = {
    blockingOperationId: null,
    error: null,
    isSending: false
  }
}: CreateConversationStoreParams): ConversationState {
  return {
    context,
    inputMessage: '',
    messages,
    operationState,
    runtimeInfo: {}
  }
}
