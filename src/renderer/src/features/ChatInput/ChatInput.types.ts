import type { ComponentType, ReactNode } from 'react'

export interface ChatInputAttachment {
  id: string
  name: string
  size?: number
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
