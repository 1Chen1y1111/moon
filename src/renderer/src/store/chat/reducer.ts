import type {
  MessageRecord,
  SendMessageEvent,
  SendMessageResult,
  SessionRecord
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
  | { type: 'loadChatMessagesPending'; sessionId: string; requestId: string }
  | {
      type: 'loadChatMessagesFulfilled'
      sessionId: string
      requestId: string
      messages: MessageRecord[]
    }
  | { type: 'loadChatMessagesRejected'; sessionId: string; requestId: string; error: unknown }
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

function upsertMessage(messages: MessageRecord[], message: MessageRecord): MessageRecord[] {
  const index = messages.findIndex((candidate) => candidate.id === message.id)

  if (index === -1) {
    return [...messages, message]
  }

  const nextMessages = [...messages]
  nextMessages[index] = message

  return nextMessages
}

function replacePendingUserMessage(
  messages: MessageRecord[],
  message: MessageRecord
): MessageRecord[] {
  const index = messages.findIndex(
    (candidate) =>
      candidate.id.startsWith('pending-') &&
      candidate.role === 'user' &&
      candidate.content === message.content
  )

  if (index === -1) {
    return upsertMessage(messages, message)
  }

  const nextMessages = [...messages]
  nextMessages[index] = message

  return nextMessages
}

function isVisibleSession(state: ChatState, sessionId: string): boolean {
  return state.activeSessionId === null || state.activeSessionId === sessionId
}

function removePendingSendMessages(state: ChatState, requestId: string): MessageRecord[] {
  const streamingAssistantMessageId = state.streamingAssistantMessageId

  return state.messages.filter(
    (message) =>
      message.id !== `pending-${requestId}` &&
      (streamingAssistantMessageId === null || message.id !== streamingAssistantMessageId)
  )
}

function applySendMessageEvent(state: ChatState, event: SendMessageEvent): ChatState {
  if (event.type === 'user-message') {
    const sessions = upsertSession(state.sessions, event.session)

    if (!isVisibleSession(state, event.session.id)) {
      return { ...state, sessions }
    }

    return {
      ...state,
      sessions,
      activeSessionId: event.session.id,
      messages: replacePendingUserMessage(state.messages, event.message)
    }
  }

  if (event.type === 'assistant-start') {
    if (!isVisibleSession(state, event.message.sessionId)) {
      return state
    }

    return {
      ...state,
      activeSessionId: event.message.sessionId,
      streamingAssistantMessageId: event.message.id,
      messages: upsertMessage(state.messages, event.message)
    }
  }

  if (event.type === 'assistant-delta') {
    const message = state.messages.find((candidate) => candidate.id === event.messageId)

    if (message === undefined || !isVisibleSession(state, message.sessionId)) {
      return state
    }

    return {
      ...state,
      messages: state.messages.map((candidate) =>
        candidate.id === event.messageId
          ? { ...candidate, content: `${candidate.content}${event.delta}` }
          : candidate
      )
    }
  }

  const sessions = upsertSession(state.sessions, event.session)

  if (!isVisibleSession(state, event.session.id)) {
    return { ...state, sessions }
  }

  return {
    ...state,
    sessions,
    activeSessionId: event.session.id,
    streamingAssistantMessageId: null,
    messages: upsertMessage(state.messages, event.message)
  }
}

export function chatReducer(state: ChatState, action: ChatReducerAction): ChatState {
  if (action.type === 'clearChatMessages') {
    return {
      ...state,
      activeSessionId: null,
      messages: [],
      messagesStatus: 'idle',
      messagesRequestId: null,
      streamingAssistantMessageId: null
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

  if (action.type === 'loadChatMessagesPending') {
    const isSameSession = state.activeSessionId === action.sessionId

    return {
      ...state,
      activeSessionId: action.sessionId,
      messagesStatus: 'loading',
      messagesRequestId: action.requestId,
      streamingAssistantMessageId: null,
      messages: isSameSession ? state.messages : [],
      error: null
    }
  }

  if (action.type === 'loadChatMessagesFulfilled') {
    if (
      state.messagesRequestId !== action.requestId ||
      state.activeSessionId !== action.sessionId
    ) {
      return state
    }

    return {
      ...state,
      messagesStatus: 'succeeded',
      messagesRequestId: null,
      messages: action.messages
    }
  }

  if (action.type === 'loadChatMessagesRejected') {
    if (
      state.messagesRequestId !== action.requestId ||
      state.activeSessionId !== action.sessionId
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
      messages: [],
      messagesRequestId: null,
      streamingAssistantMessageId: null
    }
  }

  if (action.type === 'createChatSessionRejected') {
    return { ...state, createStatus: 'failed', error: getErrorMessage(action.error) }
  }

  if (action.type === 'sendChatMessagePending') {
    return {
      ...state,
      sendStatus: 'sending',
      error: null,
      streamingAssistantMessageId: null,
      activeSessionId: action.input.sessionId ?? null,
      messages: upsertMessage(state.messages, action.optimisticMessage)
    }
  }

  if (action.type === 'sendChatMessageFulfilled') {
    const sessions = upsertSession(state.sessions, action.result.session)

    if (!isVisibleSession(state, action.result.session.id)) {
      return { ...state, sendStatus: 'succeeded', sessions, streamingAssistantMessageId: null }
    }

    return {
      ...state,
      sendStatus: 'succeeded',
      sessions,
      activeSessionId: action.result.session.id,
      streamingAssistantMessageId: null,
      messages: action.result.messages
    }
  }

  return {
    ...state,
    sendStatus: 'failed',
    error: getErrorMessage(action.error),
    messages: removePendingSendMessages(state, action.requestId),
    streamingAssistantMessageId: null
  }
}
