/**
 * 负责定义 renderer 和会话编排层共享的消息展示模型。
 * 它不等同于数据库行结构，持久化层需要自行映射到这些面向会话的语义字段。
 */

export type MessageRole =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'error'
  | 'status'
  | 'info'
  | 'warning'
  | 'plan'
  | 'auth-request'

export type ToolStatus = 'pending' | 'executing' | 'completed' | 'error' | 'backgrounded'

export type AttachmentType = 'image' | 'text' | 'pdf' | 'office' | 'audio' | 'unknown'

export type MessageAttachment = {
  id?: string
  type: AttachmentType
  name: string
  mimeType: string
  size: number
  path?: string
  base64?: string
}

export type Message = {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  toolName?: string
  toolUseId?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  toolStatus?: ToolStatus
  parentToolUseId?: string
  attachments?: MessageAttachment[]
  isError?: boolean
  isStreaming?: boolean
  isPending?: boolean
  isIntermediate?: boolean
  turnId?: string
}

export type StoredMessage = Omit<Message, 'isStreaming' | 'isPending'> & {
  isQueued?: boolean
}
