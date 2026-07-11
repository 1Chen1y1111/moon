/**
 * 负责定义 Conversation 局部 store 的状态结构和初始值。
 * 状态仅服务当前会话组件树，不承担跨 thread 持久化。
 */

import type { ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import type { MessageRecord } from '@moon/shared/domain/chat'

import type { ConversationBranchTarget, ConversationContext, OperationState } from '../types'

export type ConversationState = {
  branchTarget: ConversationBranchTarget | null
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

/**
 * 创建 Conversation store 初始状态，并把可选外部消息标记为已初始化。
 */
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
    branchTarget: null,
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
