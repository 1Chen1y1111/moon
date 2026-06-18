/**
 * 负责定义 agent backend 输出给会话编排层的统一事件协议。
 * SDK 原始事件必须先经过 adapter 转换，不能直接穿透到 UI 或持久化层。
 */

import type { AgentEventUsage } from './usage'

export type AgentToolStatus =
  | 'pending'
  | 'executing'
  | 'waiting_for_human'
  | 'completed'
  | 'error'
  | 'backgrounded'

export type AgentPermissionRequestType =
  | 'bash'
  | 'file_write'
  | 'mcp_mutation'
  | 'api_mutation'
  | 'admin_approval'

export type AgentPermissionRequest = {
  requestId: string
  toolName: string
  description: string
  command?: string
  path?: string
  type?: AgentPermissionRequestType
  reason?: string
  impact?: string
}

/**
 * 表示宿主应用对某个 agent 权限请求的人工决策，由会话编排层转交给 backend。
 */
export type AgentPermissionDecision =
  | {
      requestId: string
      approved: true
      alwaysAllow?: boolean
    }
  | {
      requestId: string
      approved: false
      reason?: string
    }

export type AgentTypedError = {
  code: string
  title: string
  message: string
  details?: string[]
  canRetry?: boolean
  originalError?: string
}

export type AgentEvent =
  | { type: 'text_delta'; text: string; turnId?: string; isIntermediate?: boolean }
  | { type: 'text_complete'; text: string; turnId?: string; isIntermediate?: boolean }
  | { type: 'reasoning_delta'; text: string; turnId?: string }
  | {
      type: 'tool_start'
      toolUseId: string
      toolName: string
      input?: Record<string, unknown>
      turnId?: string
      parentToolUseId?: string
      status?: AgentToolStatus
    }
  | {
      type: 'tool_result'
      toolUseId: string
      toolName?: string
      result?: unknown
      isError: boolean
      input?: Record<string, unknown>
      turnId?: string
      parentToolUseId?: string
    }
  | { type: 'permission_request'; request: AgentPermissionRequest; turnId?: string }
  | { type: 'usage_update'; usage: AgentEventUsage }
  | { type: 'status'; message: string; statusType?: 'compacting' | 'compaction_complete' }
  | { type: 'info'; message: string; level?: 'info' | 'warning' | 'error' | 'success' }
  | { type: 'error'; message: string; code?: string; turnId?: string }
  | { type: 'typed_error'; error: AgentTypedError; turnId?: string }
  | { type: 'session_id_update'; sessionId: string }
  | { type: 'complete'; usage?: AgentEventUsage }
