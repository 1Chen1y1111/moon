/**
 * 负责定义聊天输入框的展示参数和附件动作类型。
 * 它只描述纯 UI 组件 props，不触碰会话状态或 IPC 边界。
 */

import type { ComponentType, ReactNode } from 'react'

export interface ChatInputAttachment {
  error?: string
  id: string
  kind?: 'image' | 'file'
  name: string
  previewUrl?: string
  size?: number
  status?: 'importing' | 'success' | 'error'
  type?: string
}

export interface ChatInputAction {
  disabled?: boolean
  icon: ComponentType<{ className?: string }>
  id: string
  label: string
  onClick?: () => void
  pressed?: boolean
}

export interface ChatInputRuntimeInfo {
  modelLabel?: string
  providerLabel?: string
  shortcutLabel?: string
  statusLabel?: string
  workspaceLabel?: string
}

export interface ChatInputProps {
  attachments?: ChatInputAttachment[]
  disabled?: boolean
  isSending?: boolean
  leftActions?: ChatInputAction[]
  leftContent?: ReactNode
  maxRows?: number
  minRows?: number
  placeholder?: string
  runtimeInfo?: ChatInputRuntimeInfo
  value: string
  onAttachmentRemove?: (id: string) => void
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
}
