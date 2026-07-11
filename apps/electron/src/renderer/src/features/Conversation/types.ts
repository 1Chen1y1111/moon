/**
 * 负责定义会话组件在 renderer 内部共享的上下文和展示输入类型。
 * 它只描述 React/Zustand 边界，不定义 IPC 合同或持久化结构。
 */

import type { MessageRecord } from '@moon/shared/domain/chat'

export interface ConversationContext {
  draftLlmConnectionId: string | null
  draftProviderId: string | null
  projectId: string | null
  sessionId: string | null
  threadId: string | null
  topicId: string | null
}

export interface ConversationBranchTarget {
  parentThreadId: string
  sourceMessageId: string
  sourcePreview: string
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
