import type {
  AgentOperationRecord,
  ChatOperationEvent,
  CreateMessageTurnResult,
  MessageRecord,
  RunChatOperationResult,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@shared/domain/chat'
import type { SendChatMessageInput } from '@shared/domain/chat-validation'

import type { ChatDraftAttachment, ChatOperationState, ChatState } from './types'

export type ChatReducerAction =
  | { type: 'clearChatMessages' }
  | { type: 'clearChatError' }
  | { type: 'addDraftAttachment'; attachment: ChatDraftAttachment }
  | { type: 'clearDraftAttachments' }
  | { type: 'removeDraftAttachment'; id: string }
  | { type: 'updateDraftAttachment'; id: string; value: Partial<ChatDraftAttachment> }
  | { type: 'applyChatOperationEvent'; event: ChatOperationEvent }
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
  | { type: 'deleteChatSessionFulfilled'; sessionId: string }
  | { type: 'deleteChatSessionRejected'; error: unknown }
  | {
      type: 'sendChatMessagePending'
      input: SendChatMessageInput
      requestId: string
      optimisticAssistantMessage: MessageRecord
      optimisticOperation: AgentOperationRecord
      optimisticUserMessage: MessageRecord
    }
  | { type: 'createMessageTurnFulfilled'; requestId: string; result: CreateMessageTurnResult }
  | { type: 'runChatOperationPending'; operationId: string }
  | { type: 'runChatOperationFulfilled'; operationId: string; result: RunChatOperationResult }
  | { type: 'runChatOperationRejected'; operationId: string; error: unknown }
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

function toChatOperationStatus(operation: AgentOperationRecord): ChatOperationState['status'] {
  if (operation.status === 'idle') {
    return 'preparing'
  }

  if (operation.status === 'running') {
    return 'running'
  }

  if (operation.status === 'waiting_for_human') {
    return 'waiting_for_human'
  }

  if (operation.status === 'done') {
    return 'succeeded'
  }

  if (operation.status === 'interrupted') {
    return 'cancelled'
  }

  return 'failed'
}

function getOperationError(operation: AgentOperationRecord): string | undefined {
  const message = operation.error?.message

  return typeof message === 'string' && message.length > 0 ? message : undefined
}

function toChatOperationState(
  operation: AgentOperationRecord,
  messageIds: Pick<ChatOperationState, 'assistantMessageId' | 'userMessageId'> = {}
): ChatOperationState {
  const sessionId =
    typeof operation.appContext?.sessionId === 'string' ? operation.appContext.sessionId : undefined

  return {
    id: operation.id,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operation.topicId == null ? {} : { topicId: operation.topicId }),
    ...(operation.threadId == null ? {} : { threadId: operation.threadId }),
    ...messageIds,
    status: toChatOperationStatus(operation),
    ...(getOperationError(operation) === undefined ? {} : { error: getOperationError(operation) }),
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt
  }
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

function replaceMessageById(
  state: ChatState,
  previousMessageId: string,
  nextMessage: MessageRecord
): ChatState {
  const { [previousMessageId]: _previousMessage, ...messagesMapWithoutPrevious } = state.messagesMap
  void _previousMessage

  if (state.messagesMap[previousMessageId] === undefined) {
    return upsertMessage(state, nextMessage)
  }

  return {
    ...state,
    messageIds: state.messageIds.map((messageId) =>
      messageId === previousMessageId ? nextMessage.id : messageId
    ),
    messages: state.messages.map((candidate) =>
      candidate.id === previousMessageId ? nextMessage : candidate
    ),
    messagesMap: {
      ...messagesMapWithoutPrevious,
      [nextMessage.id]: nextMessage
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
  const removedIds = new Set([`pending-${requestId}`, `pending-assistant-${requestId}`])
  const { [`pending-operation-${requestId}`]: _pendingOperation, ...operationsById } =
    state.operationsById
  void _pendingOperation

  const nextMessageIds = state.messageIds.filter((messageId) => !removedIds.has(messageId))
  const nextMessagesMap = Object.fromEntries(
    nextMessageIds.map((messageId) => [messageId, state.messagesMap[messageId]])
  ) as ChatState['messagesMap']

  return {
    ...state,
    messageIds: nextMessageIds,
    messages: state.messages.filter((message) => !removedIds.has(message.id)),
    messagesMap: nextMessagesMap,
    operationsById
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

function withOperationStatus(
  state: ChatState,
  operationId: string,
  status: ChatOperationState['status'],
  updatedAt: string,
  error?: string
): ChatState {
  const operation = state.operationsById[operationId]

  if (operation === undefined) {
    return state
  }

  return {
    ...state,
    operationsById: {
      ...state.operationsById,
      [operationId]: {
        ...operation,
        status,
        ...(error === undefined ? {} : { error }),
        updatedAt
      }
    }
  }
}

function applyChatOperationEvent(state: ChatState, event: ChatOperationEvent): ChatState {
  if (event.type === 'operation-started') {
    const previousOperation = state.operationsById[event.operationId]
    const operation = toChatOperationState(event.operation, {
      assistantMessageId: previousOperation?.assistantMessageId,
      userMessageId: previousOperation?.userMessageId
    })

    return {
      ...state,
      activeOperationId: event.operationId,
      sendStatus: 'sending',
      operationsById: {
        ...state.operationsById,
        [event.operationId]: operation
      }
    }
  }

  if (event.type === 'message-created') {
    const withEntities = {
      ...state,
      sessions: upsertSession(state.sessions, event.session),
      topics: upsertById(state.topics, event.topic),
      threads: upsertById(state.threads, event.thread),
      operationsById: {
        ...state.operationsById,
        [event.operationId]: {
          ...(state.operationsById[event.operationId] ??
            toChatOperationState({
              id: event.operationId,
              appContext: { sessionId: event.session.id },
              topicId: event.topic.id,
              threadId: event.thread.id,
              status: 'running',
              createdAt: event.message.createdAt,
              updatedAt: event.message.updatedAt
            })),
          ...(event.message.role === 'user' ? { userMessageId: event.message.id } : {}),
          ...(event.message.role === 'assistant' ? { assistantMessageId: event.message.id } : {}),
          updatedAt: event.message.updatedAt
        }
      }
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
    const operation = state.operationsById[event.operationId]

    if (
      operation?.assistantMessageId !== undefined &&
      operation.assistantMessageId !== event.messageId
    ) {
      return state
    }

    return updateMessageById(state, event.messageId, (message) => ({
      ...message,
      content: `${message.content}${event.delta}`
    }))
  }

  if (event.type === 'reasoning-delta') {
    const operation = state.operationsById[event.operationId]

    if (
      operation?.assistantMessageId !== undefined &&
      operation.assistantMessageId !== event.messageId
    ) {
      return state
    }

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
    const operation = state.operationsById[event.operationId]

    if (
      operation?.assistantMessageId !== undefined &&
      operation.assistantMessageId !== event.messageId
    ) {
      return state
    }

    const withTool = updateMessageById(state, event.messageId, (message) =>
      updateToolInvocation(message, event.toolInvocation)
    )
    const pendingToolInvocations =
      event.type === 'tool-waiting-approval'
        ? upsertById(withTool.pendingToolInvocations, event.toolInvocation)
        : removePendingToolInvocation(withTool.pendingToolInvocations, event.toolInvocation.id)

    return {
      ...withTool,
      operationsById: withOperationStatus(
        withTool,
        event.operationId,
        event.type === 'tool-waiting-approval' ? 'waiting_for_human' : 'running',
        event.toolInvocation.updatedAt
      ).operationsById,
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
        operationsById: {
          ...state.operationsById,
          [event.operationId]: toChatOperationState(event.operation, {
            assistantMessageId: state.operationsById[event.operationId]?.assistantMessageId,
            userMessageId: state.operationsById[event.operationId]?.userMessageId
          })
        },
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
      operationsById: {
        ...state.operationsById,
        [event.operationId]: toChatOperationState(event.operation, {
          assistantMessageId: state.operationsById[event.operationId]?.assistantMessageId,
          userMessageId: state.operationsById[event.operationId]?.userMessageId
        })
      },
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
      operationsById: {
        ...state.operationsById,
        [event.operationId]: toChatOperationState(event.operation, {
          assistantMessageId: state.operationsById[event.operationId]?.assistantMessageId,
          userMessageId: state.operationsById[event.operationId]?.userMessageId
        })
      },
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
      pendingToolInvocations: [],
      operationsById: {}
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

  if (action.type === 'applyChatOperationEvent') {
    return applyChatOperationEvent(state, action.event)
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
      pendingToolInvocations: [],
      operationsById: {}
    }
  }

  if (action.type === 'createChatSessionRejected') {
    return { ...state, createStatus: 'failed', error: getErrorMessage(action.error) }
  }

  if (action.type === 'deleteChatSessionFulfilled') {
    const isActiveSession = state.activeSessionId === action.sessionId

    return {
      ...state,
      sessions: state.sessions.filter((session) => session.id !== action.sessionId),
      ...(isActiveSession
        ? {
            activeSessionId: null,
            activeTopicId: null,
            activeThreadId: null,
            activeOperationId: null,
            topics: [],
            threads: [],
            messagesMap: {},
            messageIds: [],
            messages: [],
            messagesRequestId: null,
            streamingAssistantMessageId: null,
            pendingToolInvocations: [],
            operationsById: {}
          }
        : {})
    }
  }

  if (action.type === 'deleteChatSessionRejected') {
    return { ...state, error: getErrorMessage(action.error) }
  }

  if (action.type === 'sendChatMessagePending') {
    const baseState: ChatState = {
      ...state,
      sendStatus: 'sending',
      error: null,
      messagesRequestId: null,
      streamingAssistantMessageId: action.optimisticAssistantMessage.id,
      activeOperationId: action.optimisticOperation.id,
      activeSessionId: action.input.sessionId ?? state.activeSessionId,
      activeTopicId: action.input.topicId ?? state.activeTopicId,
      activeThreadId: action.input.threadId ?? state.activeThreadId,
      operationsById: {
        ...state.operationsById,
        [action.optimisticOperation.id]: toChatOperationState(action.optimisticOperation, {
          assistantMessageId: action.optimisticAssistantMessage.id,
          userMessageId: action.optimisticUserMessage.id
        })
      }
    }

    return upsertMessage(
      upsertMessage(baseState, action.optimisticUserMessage),
      action.optimisticAssistantMessage
    )
  }

  if (action.type === 'createMessageTurnFulfilled') {
    const result = action.result
    const pendingOperationId = `pending-operation-${action.requestId}`
    const previousOperation = state.operationsById[pendingOperationId]
    const { [pendingOperationId]: _pendingOperation, ...operationsById } = state.operationsById
    void _pendingOperation

    const stateWithEntities = {
      ...state,
      sessions: upsertSession(state.sessions, result.session),
      topics: upsertById(state.topics, result.topic),
      threads: upsertById(state.threads, result.thread),
      activeOperationId: result.operation.id,
      streamingAssistantMessageId: result.assistantMessage.id,
      operationsById: {
        ...operationsById,
        [result.operation.id]: toChatOperationState(result.operation, {
          assistantMessageId: result.assistantMessage.id,
          userMessageId: result.userMessage.id
        })
      }
    }

    if (!isVisibleEvent(stateWithEntities, result.session.id, result.thread.id)) {
      return stateWithEntities
    }

    const stateWithRealUserMessage = replaceMessageById(
      {
        ...stateWithEntities,
        activeSessionId: result.session.id,
        activeTopicId: result.topic.id,
        activeThreadId: result.thread.id
      },
      previousOperation?.userMessageId ?? `pending-${action.requestId}`,
      result.userMessage
    )

    return replaceMessageById(
      stateWithRealUserMessage,
      previousOperation?.assistantMessageId ?? `pending-assistant-${action.requestId}`,
      result.assistantMessage
    )
  }

  if (action.type === 'runChatOperationPending') {
    return withOperationStatus(state, action.operationId, 'running', new Date().toISOString())
  }

  if (action.type === 'runChatOperationFulfilled') {
    const result = action.result
    const previousOperation = state.operationsById[action.operationId]
    const nextState: ChatState = {
      ...state,
      sendStatus: 'succeeded',
      activeOperationId:
        state.activeOperationId === action.operationId ? null : state.activeOperationId,
      streamingAssistantMessageId:
        previousOperation?.assistantMessageId === state.streamingAssistantMessageId
          ? null
          : state.streamingAssistantMessageId,
      pendingToolInvocations: [],
      operationsById: {
        ...state.operationsById,
        [result.operation.id]: toChatOperationState(result.operation, {
          assistantMessageId: previousOperation?.assistantMessageId,
          userMessageId: previousOperation?.userMessageId
        })
      }
    }

    const assistantMessage = result.messages.find(
      (message) => message.id === previousOperation?.assistantMessageId
    )

    if (
      assistantMessage === undefined ||
      !isVisibleEvent(nextState, assistantMessage.sessionId, assistantMessage.threadId)
    ) {
      return nextState
    }

    return {
      ...nextState,
      ...toMessageState(result.messages)
    }
  }

  if (action.type === 'runChatOperationRejected') {
    return {
      ...withOperationStatus(
        state,
        action.operationId,
        'failed',
        new Date().toISOString(),
        getErrorMessage(action.error)
      ),
      activeOperationId:
        state.activeOperationId === action.operationId ? null : state.activeOperationId,
      streamingAssistantMessageId: null,
      sendStatus: 'failed',
      error: getErrorMessage(action.error)
    }
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
        streamingAssistantMessageId: null,
        operationsById: {
          ...state.operationsById,
          [result.operation.id]: toChatOperationState(result.operation)
        }
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
      operationsById: {
        ...state.operationsById,
        [result.operation.id]: toChatOperationState(result.operation)
      },
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
    const existingOperation = state.operationsById[action.operation.id]
    const nextState = {
      ...state,
      activeOperationId:
        state.activeOperationId === action.operation.id ? null : state.activeOperationId,
      streamingAssistantMessageId:
        state.streamingAssistantMessageId === existingOperation?.assistantMessageId
          ? null
          : state.streamingAssistantMessageId,
      sendStatus: action.operation.status === 'interrupted' ? 'failed' : state.sendStatus,
      operationsById: {
        ...state.operationsById,
        [action.operation.id]: toChatOperationState(action.operation, {
          assistantMessageId: existingOperation?.assistantMessageId,
          userMessageId: existingOperation?.userMessageId
        })
      }
    }

    if (existingOperation?.assistantMessageId === undefined) {
      return nextState
    }

    return updateMessageById(nextState, existingOperation.assistantMessageId, (message) => ({
      ...message,
      status: 'cancelled',
      error: 'Cancelled by user.'
    }))
  }

  return updateMessageById(state, action.toolInvocation.messageId, (message) =>
    updateToolInvocation(message, action.toolInvocation)
  )
}
