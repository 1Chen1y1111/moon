import type {
  AgentOperationRecord,
  ChatOperationEvent,
  CreateMessageTurnResult,
  MessageRecord,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import {
  maxChatAttachmentsPerMessage,
  maxChatAttachmentSizeBytes,
  type ApproveToolCallInput,
  type CancelAgentOperationInput,
  type RejectToolCallInput,
  type SendChatMessageInput
} from '@moon/shared/domain/chat-validation'

import type { StoreSetter } from '@renderer/store/types'

import { chatReducer, type ChatReducerAction } from './reducer'
import type { ChatStore } from './store'
import type { ChatDraftAttachment } from './types'

type Setter = StoreSetter<ChatStore>

type ReplaceChatMessagesContext = {
  sessionId: string | null
  threadId: string | null
  topicId: string | null
}

let requestCounter = 0

function createRequestId(prefix: string): string {
  requestCounter += 1
  return `${prefix}-${requestCounter}`
}

function createOptimisticMessage(input: SendChatMessageInput, requestId: string): MessageRecord {
  const timestamp = new Date().toISOString()
  const sessionId = input.sessionId ?? `pending-session-${requestId}`
  const topicId = input.topicId ?? `pending-topic-${requestId}`
  const threadId = input.threadId ?? `pending-thread-${requestId}`

  return {
    id: `pending-${requestId}`,
    sessionId,
    topicId,
    threadId,
    role: 'user',
    content: input.content.trim(),
    status: 'pending',
    ...(input.attachments === undefined || input.attachments.length === 0
      ? {}
      : { attachments: input.attachments }),
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createOptimisticTurn(
  input: SendChatMessageInput,
  requestId: string
): {
  assistantMessage: MessageRecord
  operation: AgentOperationRecord
  userMessage: MessageRecord
} {
  const timestamp = new Date().toISOString()
  const sessionId = input.sessionId ?? `pending-session-${requestId}`
  const topicId = input.topicId ?? `pending-topic-${requestId}`
  const threadId = input.threadId ?? `pending-thread-${requestId}`
  const operationId = `pending-operation-${requestId}`
  const userMessage = createOptimisticMessage(input, requestId)
  const assistantMessage: MessageRecord = {
    id: `pending-assistant-${requestId}`,
    sessionId,
    topicId,
    threadId,
    parentId: userMessage.id,
    operationId,
    role: 'assistant',
    content: '',
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp
  }

  return {
    userMessage,
    assistantMessage,
    operation: {
      id: operationId,
      appContext: { sessionId },
      topicId,
      threadId,
      status: 'idle',
      createdAt: timestamp,
      updatedAt: timestamp
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return '上传失败'
}

function resolveFileMimeType(file: File): string {
  return file.type || 'application/octet-stream'
}

function resolveFileAttachmentName(file: File): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim()

  return relativePath === undefined || relativePath.length === 0 ? file.name : relativePath
}

function createPreviewUrl(file: File): string | undefined {
  if (typeof URL.createObjectURL !== 'function') {
    return undefined
  }

  return URL.createObjectURL(file)
}

function createDraftAttachment(file: File, requestId: string): ChatDraftAttachment {
  const mimeType = resolveFileMimeType(file)
  const name = resolveFileAttachmentName(file)
  const previewUrl = mimeType.startsWith('image/') ? createPreviewUrl(file) : undefined

  return {
    id: `pending-${requestId}`,
    name,
    mimeType,
    size: file.size,
    kind: mimeType.startsWith('image/') ? 'image' : 'file',
    status: 'importing',
    createdAt: new Date().toISOString(),
    ...(previewUrl === undefined ? {} : { previewUrl })
  }
}

function revokePreviewUrl(attachment: ChatDraftAttachment): void {
  if (attachment.previewUrl !== undefined && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(attachment.previewUrl)
  }
}

export class ChatActionImpl {
  readonly #get: () => ChatStore
  readonly #set: Setter

  constructor(set: Setter, get: () => ChatStore, _api?: unknown) {
    void _api
    this.#get = get
    this.#set = set
  }

  clearChatMessages = (): void => {
    this.internal_clearChatMessages()
  }

  clearChatError = (): void => {
    this.internal_clearChatError()
  }

  replaceChatMessages = (context: ReplaceChatMessagesContext, messages: MessageRecord[]): void => {
    this.internal_dispatchChat({ type: 'replaceChatMessages', context, messages })
  }

  applyChatOperationEvent = (event: ChatOperationEvent): void => {
    this.internal_applyChatOperationEvent(event)
  }

  applySendMessageEvent = (event: ChatOperationEvent): void => {
    this.internal_applyChatOperationEvent(event)
  }

  clearChatDraftAttachments = (): void => {
    this.#get().draftAttachments.forEach(revokePreviewUrl)
    this.internal_dispatchChat({ type: 'clearDraftAttachments' })
  }

  loadChatSessions = (): Promise<SessionRecord[]> => this.internal_loadChatSessions()

  loadChatTopics = (sessionId: string): Promise<TopicRecord[]> =>
    this.internal_loadChatTopics(sessionId)

  loadChatThreads = (topicId: string): Promise<ThreadRecord[]> =>
    this.internal_loadChatThreads(topicId)

  loadChatMessages = (sessionId: string): Promise<MessageRecord[]> =>
    this.internal_loadChatMessages(sessionId)

  createChatSession = (): Promise<SessionRecord> => this.internal_createChatSession()

  deleteChatSession = (sessionId: string): Promise<void> =>
    this.internal_deleteChatSession(sessionId)

  sendChatMessage = (input: SendChatMessageInput): Promise<SendMessageResult> =>
    this.internal_sendChatMessage(input)

  cancelChatOperation = (input: CancelAgentOperationInput): Promise<AgentOperationRecord> =>
    this.internal_cancelChatOperation(input)

  approveChatToolCall = (input: ApproveToolCallInput): Promise<ToolInvocationRecord> =>
    this.internal_approveChatToolCall(input)

  rejectChatToolCall = (input: RejectToolCallInput): Promise<ToolInvocationRecord> =>
    this.internal_rejectChatToolCall(input)

  removeChatDraftAttachment = (id: string): void => {
    const attachment = this.#get().draftAttachments.find((candidate) => candidate.id === id)

    if (attachment !== undefined) {
      revokePreviewUrl(attachment)
    }

    this.internal_dispatchChat({ type: 'removeDraftAttachment', id })
  }

  uploadChatAttachments = async (files: File[]): Promise<void> => {
    const remainingSlots = Math.max(
      maxChatAttachmentsPerMessage - this.#get().draftAttachments.length,
      0
    )

    await Promise.all(
      files.slice(0, remainingSlots).map((file) => this.internal_uploadChatAttachment(file))
    )
  }

  internal_clearChatMessages = (): void => {
    this.internal_dispatchChat({ type: 'clearChatMessages' })
  }

  internal_clearChatError = (): void => {
    this.internal_dispatchChat({ type: 'clearChatError' })
  }

  internal_applyChatOperationEvent = (event: ChatOperationEvent): void => {
    this.internal_dispatchChat({ type: 'applyChatOperationEvent', event })
  }

  internal_loadChatSessions = async (): Promise<SessionRecord[]> => {
    this.internal_dispatchChat({ type: 'loadChatSessionsPending' })

    try {
      const sessions = await window.api.sessions.listSessions()
      this.internal_dispatchChat({ type: 'loadChatSessionsFulfilled', sessions })
      return sessions
    } catch (error) {
      this.internal_dispatchChat({ type: 'loadChatSessionsRejected', error })
      throw error
    }
  }

  internal_loadChatTopics = async (sessionId: string): Promise<TopicRecord[]> => {
    this.internal_dispatchChat({ type: 'loadChatTopicsPending', sessionId })

    try {
      const topics = await window.api.sessions.listTopics({ sessionId })
      this.internal_dispatchChat({ type: 'loadChatTopicsFulfilled', sessionId, topics })
      return topics
    } catch (error) {
      this.internal_dispatchChat({ type: 'loadChatTopicsRejected', error, sessionId })
      throw error
    }
  }

  internal_loadChatThreads = async (topicId: string): Promise<ThreadRecord[]> => {
    this.internal_dispatchChat({ type: 'loadChatThreadsPending', topicId })

    try {
      const threads = await window.api.sessions.listThreads({ topicId })
      this.internal_dispatchChat({ type: 'loadChatThreadsFulfilled', threads, topicId })
      return threads
    } catch (error) {
      this.internal_dispatchChat({ type: 'loadChatThreadsRejected', error, topicId })
      throw error
    }
  }

  internal_loadChatMessages = async (sessionId: string): Promise<MessageRecord[]> => {
    const requestId = createRequestId('load-messages')
    const threadId = this.#get().activeThreadId ?? undefined

    this.internal_dispatchChat({ type: 'loadChatMessagesPending', sessionId, threadId, requestId })

    try {
      const messages = await window.api.sessions.getMessages({
        sessionId,
        ...(threadId === undefined ? {} : { threadId })
      })
      this.internal_dispatchChat({
        type: 'loadChatMessagesFulfilled',
        sessionId,
        threadId,
        requestId,
        messages
      })
      return messages
    } catch (error) {
      this.internal_dispatchChat({
        type: 'loadChatMessagesRejected',
        sessionId,
        threadId,
        requestId,
        error
      })
      throw error
    }
  }

  internal_createChatSession = async (): Promise<SessionRecord> => {
    this.internal_dispatchChat({ type: 'createChatSessionPending' })

    try {
      const session = await window.api.sessions.createSession()
      this.internal_dispatchChat({ type: 'createChatSessionFulfilled', session })
      return session
    } catch (error) {
      this.internal_dispatchChat({ type: 'createChatSessionRejected', error })
      throw error
    }
  }

  internal_deleteChatSession = async (sessionId: string): Promise<void> => {
    try {
      await window.api.sessions.deleteSession({ sessionId })
      this.internal_dispatchChat({ type: 'deleteChatSessionFulfilled', sessionId })
    } catch (error) {
      this.internal_dispatchChat({ type: 'deleteChatSessionRejected', error })
      throw error
    }
  }

  internal_sendChatMessage = async (input: SendChatMessageInput): Promise<SendMessageResult> => {
    const requestId = createRequestId('send-message')
    const optimisticTurn = createOptimisticTurn(input, requestId)

    this.internal_dispatchChat({
      type: 'sendChatMessagePending',
      input,
      requestId,
      optimisticAssistantMessage: optimisticTurn.assistantMessage,
      optimisticOperation: optimisticTurn.operation,
      optimisticUserMessage: optimisticTurn.userMessage
    })

    let turn: CreateMessageTurnResult

    try {
      turn = await window.api.sessions.createMessageTurn(input)
      this.internal_dispatchChat({ type: 'createMessageTurnFulfilled', requestId, result: turn })
    } catch (error) {
      this.internal_dispatchChat({ type: 'sendChatMessageRejected', requestId, error })
      throw error
    }

    void this.internal_runChatOperation(turn.operation.id)

    return {
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      operation: turn.operation,
      messages: [turn.userMessage, turn.assistantMessage]
    }
  }

  internal_runChatOperation = async (operationId: string): Promise<void> => {
    this.internal_dispatchChat({ type: 'runChatOperationPending', operationId })

    try {
      const result = await window.api.sessions.runOperation({ operationId })
      this.internal_dispatchChat({ type: 'runChatOperationFulfilled', operationId, result })
    } catch (error) {
      this.internal_dispatchChat({ type: 'runChatOperationRejected', operationId, error })
    }
  }

  internal_dispatchChat = (action: ChatReducerAction): void => {
    this.#set((state) => chatReducer(state, action))
  }

  internal_cancelChatOperation = async (
    input: CancelAgentOperationInput
  ): Promise<AgentOperationRecord> => {
    const operation = await window.api.sessions.cancelOperation(input)
    this.internal_dispatchChat({ type: 'cancelChatOperationFulfilled', operation })
    return operation
  }

  internal_approveChatToolCall = async (
    input: ApproveToolCallInput
  ): Promise<ToolInvocationRecord> => {
    const toolInvocation = await window.api.sessions.approveToolCall(input)
    this.internal_dispatchChat({ type: 'updateChatToolInvocation', toolInvocation })
    return toolInvocation
  }

  internal_rejectChatToolCall = async (
    input: RejectToolCallInput
  ): Promise<ToolInvocationRecord> => {
    const toolInvocation = await window.api.sessions.rejectToolCall(input)
    this.internal_dispatchChat({ type: 'updateChatToolInvocation', toolInvocation })
    return toolInvocation
  }

  internal_uploadChatAttachment = async (file: File): Promise<void> => {
    const requestId = createRequestId('attachment')
    const attachment = createDraftAttachment(file, requestId)

    this.internal_dispatchChat({ type: 'addDraftAttachment', attachment })

    if (file.size > maxChatAttachmentSizeBytes) {
      this.internal_dispatchChat({
        type: 'updateDraftAttachment',
        id: attachment.id,
        value: { status: 'error', error: '文件不能超过 10 MB' }
      })
      return
    }

    try {
      const data = await file.arrayBuffer()
      const importedAttachment = await window.api.sessions.importAttachment({
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: file.size,
        data
      })

      this.internal_dispatchChat({
        type: 'updateDraftAttachment',
        id: attachment.id,
        value: {
          ...importedAttachment,
          status: 'success',
          previewUrl: attachment.previewUrl
        }
      })
    } catch (error) {
      this.internal_dispatchChat({
        type: 'updateDraftAttachment',
        id: attachment.id,
        value: {
          status: 'error',
          error: getErrorMessage(error)
        }
      })
    }
  }
}

export type ChatAction = Pick<ChatActionImpl, keyof ChatActionImpl>

export const createChatSlice = (set: Setter, get: () => ChatStore, api?: unknown): ChatActionImpl =>
  new ChatActionImpl(set, get, api)
