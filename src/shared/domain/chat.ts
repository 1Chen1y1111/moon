import type { ProviderId } from './provider'

export const defaultChatUserId = 'local-user'

export const sessionStatuses = ['active', 'archived'] as const

export type SessionStatus = (typeof sessionStatuses)[number]

export const sessionTypes = ['agent', 'group'] as const

export type SessionType = (typeof sessionTypes)[number]

export const topicStatuses = ['active', 'completed', 'archived'] as const

export type TopicStatus = (typeof topicStatuses)[number]

export const topicModes = ['temp', 'test', 'default'] as const

export type TopicMode = (typeof topicModes)[number]

export const threadTypes = ['continuation', 'standalone', 'isolation', 'eval'] as const

export type ThreadType = (typeof threadTypes)[number]

export const threadStatuses = [
  'active',
  'processing',
  'pending',
  'inReview',
  'todo',
  'cancel',
  'completed',
  'failed'
] as const

export type ThreadStatus = (typeof threadStatuses)[number]

export const messageRoles = ['user', 'assistant', 'system', 'tool'] as const

export type MessageRole = (typeof messageRoles)[number]

export const messageStatuses = ['pending', 'streaming', 'complete', 'error', 'cancelled'] as const

export type MessageStatus = (typeof messageStatuses)[number]

export const agentOperationStatuses = [
  'idle',
  'running',
  'waiting_for_human',
  'done',
  'error',
  'interrupted'
] as const

export type AgentOperationStatus = (typeof agentOperationStatuses)[number]

export const agentOperationCompletionReasons = [
  'done',
  'error',
  'interrupted',
  'max_steps',
  'cost_limit',
  'waiting_for_human'
] as const

export type AgentOperationCompletionReason = (typeof agentOperationCompletionReasons)[number]

export const toolInvocationStatuses = [
  'running',
  'waiting_for_human',
  'done',
  'error',
  'rejected'
] as const

export type ToolInvocationStatus = (typeof toolInvocationStatuses)[number]

export const chatAttachmentKinds = ['image', 'file'] as const

export type ChatAttachmentKind = (typeof chatAttachmentKinds)[number]

export type ChatJsonObject = Record<string, unknown>

export type ChatMetadata = ChatJsonObject

export type MessageToolRecord = {
  id: string
  apiName?: string | null
  arguments?: ChatJsonObject
  error?: string | null
  identifier?: string | null
  result?: unknown
  status?: ToolInvocationStatus
  type?: string | null
}

export type AgentOperationError = ChatJsonObject & {
  message?: string
  stack?: string
  type?: string
}

export type AgentOperationInterruption = {
  canResume: boolean
  interruptedAt: string
  reason: string
}

export type AgentOperationAppContext = ChatJsonObject & {
  defaultTaskAssigneeAgentId?: string
  documentId?: string | null
  groupId?: string | null
  scope?: string | null
  sessionId?: string
  sourceMessageId?: string
}

export type ChatAttachmentRecord = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: ChatAttachmentKind
  createdAt: string
}

export type SessionRecord = {
  id: string
  slug?: string
  projectId: string | null
  provider: ProviderId
  title?: string | null
  description?: string | null
  avatar?: string | null
  backgroundColor?: string | null
  type?: SessionType | null
  status: SessionStatus
  userId?: string
  groupId?: string | null
  clientId?: string | null
  pinned?: boolean
  createdAt: string
  updatedAt: string
}

export type TopicRecord = {
  id: string
  sessionId?: string | null
  title?: string | null
  favorite?: boolean
  content?: string | null
  editorData?: unknown
  agentId?: string | null
  groupId?: string | null
  userId?: string
  clientId?: string | null
  description?: string | null
  historySummary?: string | null
  metadata?: ChatMetadata
  trigger?: string | null
  mode?: TopicMode | null
  status?: TopicStatus | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type ThreadRecord = {
  id: string
  topicId: string
  title?: string | null
  content?: string | null
  editorData?: unknown
  type: ThreadType
  status?: ThreadStatus | null
  sourceMessageId?: string | null
  parentThreadId?: string | null
  clientId?: string | null
  agentId?: string | null
  groupId?: string | null
  metadata?: ChatMetadata
  userId?: string
  lastActiveAt?: string | null
  createdAt: string
  updatedAt: string
}

export type AgentOperationRecord = {
  id: string
  userId?: string
  agentId?: string | null
  topicId?: string | null
  threadId?: string | null
  taskId?: string | null
  chatGroupId?: string | null
  parentOperationId?: string | null
  status: AgentOperationStatus
  completionReason?: AgentOperationCompletionReason | null
  startedAt?: string | null
  completedAt?: string | null
  stepCount?: number | null
  maxSteps?: number | null
  forceFinish?: boolean | null
  interruption?: AgentOperationInterruption | null
  error?: AgentOperationError | null
  totalCost?: string | null
  currency?: string
  totalInputTokens?: number | null
  totalOutputTokens?: number | null
  totalTokens?: number | null
  llmCalls?: number | null
  toolCalls?: number | null
  humanInterventions?: number | null
  processingTimeMs?: number | null
  humanWaitingTimeMs?: number | null
  cost?: ChatJsonObject | null
  usage?: ChatJsonObject | null
  costLimit?: ChatJsonObject | null
  model?: string | null
  provider?: ProviderId | null
  modelRuntimeConfig?: ChatJsonObject | null
  trigger?: string | null
  appContext?: AgentOperationAppContext | null
  traceS3Key?: string | null
  metadata?: ChatMetadata
  createdAt: string
  updatedAt: string
}

export type ToolInvocationRecord = {
  id: string
  pluginMessageId?: string | null
  toolCallId?: string | null
  operationId?: string | null
  messageId: string
  name: string
  arguments: ChatJsonObject
  type?: string | null
  identifier?: string | null
  intervention?: ChatJsonObject | null
  state?: ChatJsonObject | null
  result?: unknown
  error?: string | null
  status: ToolInvocationStatus
  userId?: string
  clientId?: string | null
  createdAt: string
  updatedAt: string
}

export type MessageRecord = {
  id: string
  sessionId: string
  topicId: string
  threadId: string
  parentId?: string | null
  operationId?: string | null
  role: MessageRole
  content: string
  editorData?: unknown
  summary?: string | null
  reasoning?: string
  search?: unknown
  error?: string | null
  status: MessageStatus
  provider?: ProviderId | null
  model?: string | null
  favorite?: boolean
  tools?: MessageToolRecord[]
  traceId?: string | null
  observationId?: string | null
  clientId?: string | null
  userId?: string
  quotaId?: string | null
  agentId?: string | null
  groupId?: string | null
  targetId?: string | null
  messageGroupId?: string | null
  metadata?: ChatJsonObject
  attachments?: ChatAttachmentRecord[]
  toolInvocations?: ToolInvocationRecord[]
  createdAt: string
  updatedAt: string
}

export type SendMessageResult = {
  session: SessionRecord
  topic: TopicRecord
  thread: ThreadRecord
  operation: AgentOperationRecord
  messages: MessageRecord[]
}

export type CreateMessageTurnResult = {
  session: SessionRecord
  topic: TopicRecord
  thread: ThreadRecord
  operation: AgentOperationRecord
  userMessage: MessageRecord
  assistantMessage: MessageRecord
}

export type RunChatOperationResult = {
  operation: AgentOperationRecord
  messages: MessageRecord[]
}

export type ChatOperationEvent =
  | {
      type: 'operation-started'
      operationId: string
      operation: AgentOperationRecord
    }
  | {
      type: 'message-created'
      operationId: string
      session: SessionRecord
      topic: TopicRecord
      thread: ThreadRecord
      message: MessageRecord
    }
  | {
      type: 'message-delta'
      operationId: string
      sessionId: string
      topicId: string
      threadId: string
      messageId: string
      delta: string
    }
  | {
      type: 'reasoning-delta'
      operationId: string
      sessionId: string
      topicId: string
      threadId: string
      messageId: string
      delta: string
    }
  | {
      type: 'tool-start'
      operationId: string
      sessionId: string
      topicId: string
      threadId: string
      messageId: string
      toolInvocation: ToolInvocationRecord
    }
  | {
      type: 'tool-waiting-approval'
      operationId: string
      sessionId: string
      topicId: string
      threadId: string
      messageId: string
      toolInvocation: ToolInvocationRecord
    }
  | {
      type: 'tool-finish'
      operationId: string
      sessionId: string
      topicId: string
      threadId: string
      messageId: string
      toolInvocation: ToolInvocationRecord
    }
  | {
      type: 'operation-done'
      operationId: string
      session: SessionRecord
      topic: TopicRecord
      thread: ThreadRecord
      operation: AgentOperationRecord
      messages: MessageRecord[]
    }
  | {
      type: 'operation-error'
      operationId: string
      sessionId: string
      topicId: string
      threadId: string
      messageId?: string
      error: string
      operation: AgentOperationRecord
    }

export type SendMessageEvent = ChatOperationEvent

export type MessageSearchResult = {
  messageId: string
  sessionId: string
  threadId: string
  content: string
}
