import type {
  AgentOperationRecord,
  MessageRecord,
  SendMessageEvent,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@shared/domain/chat'
import type { SendChatMessageInput } from '@shared/domain/chat-validation'

import type { ChatDraftAttachment, ChatState } from './types'

export type ChatReducerAction =
  | { type: 'clearChatMessages' }
  | { type: 'clearChatError' }
  | { type: 'addDraftAttachment'; attachment: ChatDraftAttachment }
  | { type: 'clearDraftAttachments' }
  | { type: 'removeDraftAttachment'; id: string }
  | { type: 'updateDraftAttachment'; id: string; value: Partial<ChatDraftAttachment> }
  | { type: 'applySendMessageEvent'; event: SendMessageEvent }
  | { type: 'loadChatSessionsPending' }
  | { type: 'loadChatSessionsFulfilled'; sessions: SessionRecord[] }
  | { type: 'loadChatSessionsRejected'; error: unknown }
  | { type: 'loadChatTopicsPending'; sessionId: string }
  | { type: 'loadChatTopicsFulfilled'; sessionId: string; topics: TopicRecord[] }
  | { type: 'loadChatTopicsRejected'; sessionId: string; error: unknown }
  | { type: 'loadChatThreadsPending'; topicId: string }
  | { type: 'loadChatThreadsFulfilled'; topicId: string; threads: ThreadRecord[] }
  | { type: 'loadChatThreadsRejected'; topicId: string; error: unknown }
  | {
      type: 'loadChatMessagesPending'
      sessionId: string
      threadId?: string
      requestId: string
    }
  | {
      type: 'loadChatMessagesFulfilled'
      sessionId: string
      threadId?: string
      requestId: string
      messages: MessageRecord[]
    }
  | {
      type: 'loadChatMessagesRejected'
      sessionId: string
      threadId?: string
      requestId: string
      error: unknown
    }
  | { type: 'createChatSessionPending' }
  | { type: 'createChatSessionFulfilled'; session: SessionRecord }
  | { type: 'createChatSessionRejected'; error: unknown }
  | {
      type: 'sendChatMessagePending'
      input: SendChatMessageInput
      requestId: string
      optimisticMessage: MessageRecord
    }
  | { type: 'sendChatMessageFulfilled'; result: SendMessageResult }
  | { type: 'sendChatMessageRejected'; requestId: string; error: unknown }
  | { type: 'cancelChatOperationFulfilled'; operation: AgentOperationRecord }
  | { type: 'updateChatToolInvocation'; toolInvocation: ToolInvocationRecord }

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

  return '操作失败'
}

function sortSessions(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  )
}

function upsertSession(sessions: SessionRecord[], session: SessionRecord): SessionRecord[] {
  const nextSessions = sessions.filter((candidate) => candidate.id !== session.id)

  return sortSessions([session, ...nextSessions])
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id)

  if (index === -1) {
    return [...items, item]
  }

  const nextItems = [...items]
  nextItems[index] = item

  return nextItems
}

function toMessageState(
  messages: MessageRecord[]
): Pick<ChatState, 'messageIds' | 'messages' | 'messagesMap'> {
  return {
    messages,
    messageIds: messages.map((message) => message.id),
    messagesMap: Object.fromEntries(messages.map((message) => [message.id, message]))
  }
}

function upsertMessage(state: ChatState, message: MessageRecord): ChatState {
  const hasMessage = state.messagesMap[message.id] !== undefined

  return {
    ...state,
    messageIds: hasMessage ? state.messageIds : [...state.messageIds, message.id],
    messages: hasMessage
      ? state.messages.map((candidate) => (candidate.id === message.id ? message : candidate))
      : [...state.messages, message],
    messagesMap: {
      ...state.messagesMap,
      [message.id]: message
    }
  }
}

function replacePendingUserMessage(state: ChatState, message: MessageRecord): ChatState {
  const pendingId = state.messageIds.find((messageId) => {
    const candidate = state.messagesMap[messageId]

    return (
      candidate !== undefined &&
      candidate.id.startsWith('pending-') &&
      candidate.role === 'user' &&
      candidate.content === message.content
    )
  })

  if (pendingId === undefined) {
    return upsertMessage(state, message)
  }

  const { [pendingId]: _pendingMessage, ...messagesMapWithoutPending } = state.messagesMap
  void _pendingMessage

  return {
    ...state,
    messageIds: state.messageIds.map((messageId) =>
      messageId === pendingId ? message.id : messageId
    ),
    messages: state.messages.map((candidate) => (candidate.id === pendingId ? message : candidate)),
    messagesMap: {
      ...messagesMapWithoutPending,
      [message.id]: message
    }
  }
}

function isVisibleEvent(state: ChatState, sessionId: string, threadId?: string): boolean {
  if (state.activeSessionId !== null && state.activeSessionId !== sessionId) {
    return false
  }

  return (
    state.activeThreadId === null || threadId === undefined || state.activeThreadId === threadId
  )
}

function updateMessageById(
  state: ChatState,
  messageId: string,
  updater: (message: MessageRecord) => MessageRecord
): ChatState {
  const message = state.messagesMap[messageId]

  if (message === undefined || !isVisibleEvent(state, message.sessionId, message.threadId)) {
    return state
  }

  return {
    ...state,
    messages: state.messages.map((candidate) =>
      candidate.id === messageId ? updater(message) : candidate
    ),
    messagesMap: {
      ...state.messagesMap,
      [messageId]: updater(message)
    }
  }
}

function removePendingSendMessages(state: ChatState, requestId: string): ChatState {
  const removedIds = new Set([`pending-${requestId}`])

  if (state.streamingAssistantMessageId !== null) {
    removedIds.add(state.streamingAssistantMessageId)
  }

  const nextMessageIds = state.messageIds.filter((messageId) => !removedIds.has(messageId))
  const nextMessagesMap = Object.fromEntries(
    nextMessageIds.map((messageId) => [messageId, state.messagesMap[messageId]])
  ) as ChatState['messagesMap']

  return {
    ...state,
    messageIds: nextMessageIds,
    messages: state.messages.filter((message) => !removedIds.has(message.id)),
    messagesMap: nextMessagesMap
  }
}

function updateToolInvocation(
  message: MessageRecord,
  toolInvocation: ToolInvocationRecord
): MessageRecord {
  const toolInvocations = message.toolInvocations ?? []

  return {
    ...message,
    toolInvocations: upsertById(toolInvocations, toolInvocation)
  }
}

function removePendingToolInvocation(
  pendingToolInvocations: ToolInvocationRecord[],
  toolInvocationId: string
): ToolInvocationRecord[] {
  return pendingToolInvocations.filter((toolInvocation) => toolInvocation.id !== toolInvocationId)
}

function applySendMessageEvent(state: ChatState, event: SendMessageEvent): ChatState {
  if (event.type === 'message-created') {
    const withEntities = {
      ...state,
      sessions: upsertSession(state.sessions, event.session),
      topics: upsertById(state.topics, event.topic),
      threads: upsertById(state.threads, event.thread)
    }

    if (!isVisibleEvent(withEntities, event.session.id, event.thread.id)) {
      return withEntities
    }

    const nextState = {
      ...withEntities,
      activeSessionId: event.session.id,
      activeTopicId: event.topic.id,
      activeThreadId: event.thread.id,
      activeOperationId: event.operationId,
      streamingAssistantMessageId:
        event.message.role === 'assistant'
          ? event.message.id
          : withEntities.streamingAssistantMessageId
    }

    return event.message.role === 'user'
      ? replacePendingUserMessage(nextState, event.message)
      : upsertMessage(nextState, event.message)
  }

  if (event.type === 'message-delta') {
    return updateMessageById(state, event.messageId, (message) => ({
      ...message,
      content: `${message.content}${event.delta}`
    }))
  }

  if (event.type === 'reasoning-delta') {
    return updateMessageById(state, event.messageId, (message) => ({
      ...message,
      reasoning: `${message.reasoning ?? ''}${event.delta}`
    }))
  }

  if (
    event.type === 'tool-start' ||
    event.type === 'tool-waiting-approval' ||
    event.type === 'tool-finish'
  ) {
    const withTool = updateMessageById(state, event.messageId, (message) =>
      updateToolInvocation(message, event.toolInvocation)
    )
    const pendingToolInvocations =
      event.type === 'tool-waiting-approval'
        ? upsertById(withTool.pendingToolInvocations, event.toolInvocation)
        : removePendingToolInvocation(withTool.pendingToolInvocations, event.toolInvocation.id)

    return {
      ...withTool,
      pendingToolInvocations
    }
  }

  if (event.type === 'operation-done') {
    if (!isVisibleEvent(state, event.session.id, event.thread.id)) {
      return {
        ...state,
        sessions: upsertSession(state.sessions, event.session),
        topics: upsertById(state.topics, event.topic),
        threads: upsertById(state.threads, event.thread),
        activeOperationId:
          state.activeOperationId === event.operationId ? null : state.activeOperationId
      }
    }

    return {
      ...state,
      sessions: upsertSession(state.sessions, event.session),
      topics: upsertById(state.topics, event.topic),
      threads: upsertById(state.threads, event.thread),
      activeSessionId: event.session.id,
      activeTopicId: event.topic.id,
      activeThreadId: event.thread.id,
      activeOperationId: null,
      streamingAssistantMessageId: null,
      sendStatus: 'succeeded',
      pendingToolInvocations: [],
      ...toMessageState(event.messages)
    }
  }

  if (!isVisibleEvent(state, event.sessionId, event.threadId)) {
    return state
  }

  return updateMessageById(
    {
      ...state,
      activeOperationId: null,
      streamingAssistantMessageId: null,
      sendStatus: 'failed',
      error: event.error
    },
    event.messageId ?? '',
    (message) => ({
      ...message,
      status: 'error',
      error: event.error
    })
  )
}

export function chatReducer(state: ChatState, action: ChatReducerAction): ChatState {
  if (action.type === 'clearChatMessages') {
    return {
      ...state,
      activeSessionId: null,
      activeTopicId: null,
      activeThreadId: null,
      activeOperationId: null,
      messagesMap: {},
      messageIds: [],
      messagesStatus: 'idle',
      messagesRequestId: null,
      streamingAssistantMessageId: null,
      pendingToolInvocations: []
    }
  }

  if (action.type === 'clearChatError') {
    return { ...state, error: null }
  }

  if (action.type === 'addDraftAttachment') {
    return { ...state, draftAttachments: [...state.draftAttachments, action.attachment] }
  }

  if (action.type === 'clearDraftAttachments') {
    return { ...state, draftAttachments: [] }
  }

  if (action.type === 'removeDraftAttachment') {
    return {
      ...state,
      draftAttachments: state.draftAttachments.filter((attachment) => attachment.id !== action.id)
    }
  }

  if (action.type === 'updateDraftAttachment') {
    return {
      ...state,
      draftAttachments: state.draftAttachments.map((attachment) =>
        attachment.id === action.id ? { ...attachment, ...action.value } : attachment
      )
    }
  }

  if (action.type === 'applySendMessageEvent') {
    return applySendMessageEvent(state, action.event)
  }

  if (action.type === 'loadChatSessionsPending') {
    return { ...state, sessionsStatus: 'loading', error: null }
  }

  if (action.type === 'loadChatSessionsFulfilled') {
    return { ...state, sessionsStatus: 'succeeded', sessions: action.sessions }
  }

  if (action.type === 'loadChatSessionsRejected') {
    return { ...state, sessionsStatus: 'failed', error: getErrorMessage(action.error) }
  }

  if (action.type === 'loadChatTopicsPending') {
    return {
      ...state,
      activeSessionId: action.sessionId,
      topicsStatus: 'loading',
      topics: [],
      threads: [],
      activeTopicId: null,
      activeThreadId: null,
      error: null
    }
  }

  if (action.type === 'loadChatTopicsFulfilled') {
    const activeTopicId = action.topics[0]?.id ?? null

    return {
      ...state,
      topicsStatus: 'succeeded',
      topics: action.topics,
      activeTopicId
    }
  }

  if (action.type === 'loadChatTopicsRejected') {
    return { ...state, topicsStatus: 'failed', error: getErrorMessage(action.error) }
  }

  if (action.type === 'loadChatThreadsPending') {
    return {
      ...state,
      activeTopicId: action.topicId,
      threadsStatus: 'loading',
      activeThreadId: null,
      error: null
    }
  }

  if (action.type === 'loadChatThreadsFulfilled') {
    return {
      ...state,
      threadsStatus: 'succeeded',
      threads: action.threads,
      activeThreadId: action.threads[0]?.id ?? null
    }
  }

  if (action.type === 'loadChatThreadsRejected') {
    return { ...state, threadsStatus: 'failed', error: getErrorMessage(action.error) }
  }

  if (action.type === 'loadChatMessagesPending') {
    const isSameThread =
      action.threadId !== undefined &&
      state.activeSessionId === action.sessionId &&
      state.activeThreadId === action.threadId

    return {
      ...state,
      activeSessionId: action.sessionId,
      activeThreadId: action.threadId ?? state.activeThreadId,
      messagesStatus: 'loading',
      messagesRequestId: action.requestId,
      streamingAssistantMessageId: null,
      ...(isSameThread ? {} : toMessageState([])),
      error: null
    }
  }

  if (action.type === 'loadChatMessagesFulfilled') {
    if (
      state.messagesRequestId !== action.requestId ||
      state.activeSessionId !== action.sessionId ||
      (action.threadId !== undefined && state.activeThreadId !== action.threadId)
    ) {
      return state
    }

    return {
      ...state,
      messagesStatus: 'succeeded',
      messagesRequestId: null,
      ...toMessageState(action.messages)
    }
  }

  if (action.type === 'loadChatMessagesRejected') {
    if (
      state.messagesRequestId !== action.requestId ||
      state.activeSessionId !== action.sessionId ||
      (action.threadId !== undefined && state.activeThreadId !== action.threadId)
    ) {
      return state
    }

    return {
      ...state,
      messagesStatus: 'failed',
      messagesRequestId: null,
      error: getErrorMessage(action.error)
    }
  }

  if (action.type === 'createChatSessionPending') {
    return { ...state, createStatus: 'creating', error: null }
  }

  if (action.type === 'createChatSessionFulfilled') {
    return {
      ...state,
      createStatus: 'succeeded',
      sessions: upsertSession(state.sessions, action.session),
      activeSessionId: action.session.id,
      activeTopicId: null,
      activeThreadId: null,
      activeOperationId: null,
      ...toMessageState([]),
      messagesRequestId: null,
      streamingAssistantMessageId: null,
      pendingToolInvocations: []
    }
  }

  if (action.type === 'createChatSessionRejected') {
    return { ...state, createStatus: 'failed', error: getErrorMessage(action.error) }
  }

  if (action.type === 'sendChatMessagePending') {
    return upsertMessage(
      {
        ...state,
        sendStatus: 'sending',
        error: null,
        messagesRequestId: null,
        streamingAssistantMessageId: null,
        activeSessionId: action.input.sessionId ?? state.activeSessionId,
        activeTopicId: action.input.topicId ?? state.activeTopicId,
        activeThreadId: action.input.threadId ?? state.activeThreadId
      },
      action.optimisticMessage
    )
  }

  if (action.type === 'sendChatMessageFulfilled') {
    const result = action.result

    if (!isVisibleEvent(state, result.session.id, result.thread.id)) {
      return {
        ...state,
        sendStatus: 'succeeded',
        sessions: upsertSession(state.sessions, result.session),
        topics: upsertById(state.topics, result.topic),
        threads: upsertById(state.threads, result.thread),
        activeOperationId: null,
        streamingAssistantMessageId: null
      }
    }

    return {
      ...state,
      sendStatus: 'succeeded',
      sessions: upsertSession(state.sessions, result.session),
      topics: upsertById(state.topics, result.topic),
      threads: upsertById(state.threads, result.thread),
      activeSessionId: result.session.id,
      activeTopicId: result.topic.id,
      activeThreadId: result.thread.id,
      activeOperationId: null,
      streamingAssistantMessageId: null,
      pendingToolInvocations: [],
      ...toMessageState(result.messages)
    }
  }

  if (action.type === 'sendChatMessageRejected') {
    return {
      ...removePendingSendMessages(state, action.requestId),
      sendStatus: 'failed',
      error: getErrorMessage(action.error),
      activeOperationId: null,
      streamingAssistantMessageId: null
    }
  }

  if (action.type === 'cancelChatOperationFulfilled') {
    return {
      ...state,
      activeOperationId:
        state.activeOperationId === action.operation.id ? null : state.activeOperationId,
      sendStatus: action.operation.status === 'interrupted' ? 'failed' : state.sendStatus
    }
  }

  return updateMessageById(state, action.toolInvocation.messageId, (message) =>
    updateToolInvocation(message, action.toolInvocation)
  )
}
