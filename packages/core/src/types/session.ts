/**
 * 负责定义会话边界的核心类型。
 * SDK 会话、UI 会话和持久化会话会逐步向这里对齐，但具体存储格式不在本文件约束。
 */

import type { StoredMessage } from './message'
import type { TokenUsage } from './usage'

export type SessionStatus = 'todo' | 'in_progress' | 'needs_review' | 'done' | 'cancelled'

export type Session = {
  id: string
  workspaceId: string
  sdkSessionId?: string
  name?: string
  createdAt: number
  lastUsedAt: number
  isArchived?: boolean
  isFlagged?: boolean
  status?: SessionStatus
  lastReadMessageId?: string
}

export type StoredSession = Session & {
  messages: StoredMessage[]
  tokenUsage: TokenUsage
}

export type SessionMetadata = {
  id: string
  workspaceId: string
  name?: string
  createdAt: number
  lastUsedAt: number
  messageCount: number
  preview?: string
  sdkSessionId?: string
  isArchived?: boolean
  isFlagged?: boolean
  status?: SessionStatus
  hidden?: boolean
}
