import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type {
  MessageRecord,
  SendMessageEvent,
  SendMessageResult,
  SessionRecord
} from '@shared/domain/chat'
import type { SendChatMessageInput } from '@shared/domain/chat-validation'

import type { ChatState } from '../chat.types'

const initialState: ChatState = {
  activeSessionId: null,
  sessions: [],
  messages: [],
  sessionsStatus: 'idle',
  messagesStatus: 'idle',
  createStatus: 'idle',
  sendStatus: 'idle',
  messagesRequestId: null,
  streamingAssistantMessageId: null,
  error: null
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

function removePendingSendMessages(state: ChatState, requestId: string): void {
  const streamingAssistantMessageId = state.streamingAssistantMessageId

  state.messages = state.messages.filter(
    (message) =>
      message.id !== `pending-${requestId}` &&
      (streamingAssistantMessageId === null || message.id !== streamingAssistantMessageId)
  )
  state.streamingAssistantMessageId = null
}

export const loadChatSessions = createAsyncThunk('chat/loadSessions', () =>
  window.api.chat.listSessions()
)

export const loadChatMessages = createAsyncThunk('chat/loadMessages', (sessionId: string) =>
  window.api.chat.getMessages({ sessionId })
)

export const createChatSession = createAsyncThunk('chat/createSession', () =>
  window.api.chat.createSession()
)

export const sendChatMessage = createAsyncThunk<
  SendMessageResult,
  SendChatMessageInput,
  { pendingMeta: { optimisticMessage: MessageRecord } }
>('chat/sendMessage', (input) => window.api.chat.sendMessage(input), {
  getPendingMeta({ arg, requestId }) {
    const timestamp = new Date().toISOString()

    return {
      optimisticMessage: {
        id: `pending-${requestId}`,
        sessionId: arg.sessionId ?? `pending-session-${requestId}`,
        role: 'user',
        content: arg.content.trim(),
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }
  }
})

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearChatMessages(state) {
      state.activeSessionId = null
      state.messages = []
      state.messagesStatus = 'idle'
      state.messagesRequestId = null
      state.streamingAssistantMessageId = null
    },
    clearChatError(state) {
      state.error = null
    },
    applySendMessageEvent(state, action: PayloadAction<SendMessageEvent>) {
      const event = action.payload

      if (event.type === 'user-message') {
        state.sessions = upsertSession(state.sessions, event.session)

        if (!isVisibleSession(state, event.session.id)) {
          return
        }

        state.activeSessionId = event.session.id
        state.messages = replacePendingUserMessage(state.messages, event.message)
        return
      }

      if (event.type === 'assistant-start') {
        if (!isVisibleSession(state, event.message.sessionId)) {
          return
        }

        state.activeSessionId = event.message.sessionId
        state.streamingAssistantMessageId = event.message.id
        state.messages = upsertMessage(state.messages, event.message)
        return
      }

      if (event.type === 'assistant-delta') {
        const message = state.messages.find((candidate) => candidate.id === event.messageId)

        if (message !== undefined) {
          if (!isVisibleSession(state, message.sessionId)) {
            return
          }

          message.content += event.delta
        }
        return
      }

      state.sessions = upsertSession(state.sessions, event.session)

      if (!isVisibleSession(state, event.session.id)) {
        return
      }

      state.activeSessionId = event.session.id
      state.streamingAssistantMessageId = null
      state.messages = upsertMessage(state.messages, event.message)
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadChatSessions.pending, (state) => {
        state.sessionsStatus = 'loading'
        state.error = null
      })
      .addCase(loadChatSessions.fulfilled, (state, action) => {
        state.sessionsStatus = 'succeeded'
        state.sessions = action.payload
      })
      .addCase(loadChatSessions.rejected, (state, action) => {
        state.sessionsStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
      .addCase(loadChatMessages.pending, (state, action) => {
        const isSameSession = state.activeSessionId === action.meta.arg

        state.activeSessionId = action.meta.arg
        state.messagesStatus = 'loading'
        state.messagesRequestId = action.meta.requestId
        state.streamingAssistantMessageId = null
        if (!isSameSession) {
          state.messages = []
        }
        state.error = null
      })
      .addCase(loadChatMessages.fulfilled, (state, action) => {
        if (
          state.messagesRequestId !== action.meta.requestId ||
          state.activeSessionId !== action.meta.arg
        ) {
          return
        }

        state.messagesStatus = 'succeeded'
        state.messagesRequestId = null
        state.messages = action.payload
      })
      .addCase(loadChatMessages.rejected, (state, action) => {
        if (
          state.messagesRequestId !== action.meta.requestId ||
          state.activeSessionId !== action.meta.arg
        ) {
          return
        }

        state.messagesStatus = 'failed'
        state.messagesRequestId = null
        state.error = getErrorMessage(action.error)
      })
      .addCase(createChatSession.pending, (state) => {
        state.createStatus = 'creating'
        state.error = null
      })
      .addCase(createChatSession.fulfilled, (state, action) => {
        state.createStatus = 'succeeded'
        state.sessions = upsertSession(state.sessions, action.payload)
        state.activeSessionId = action.payload.id
        state.messages = []
        state.messagesRequestId = null
        state.streamingAssistantMessageId = null
      })
      .addCase(createChatSession.rejected, (state, action) => {
        state.createStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
      .addCase(sendChatMessage.pending, (state, action) => {
        state.sendStatus = 'sending'
        state.error = null
        state.streamingAssistantMessageId = null
        state.activeSessionId = action.meta.arg.sessionId ?? null
        state.messages = upsertMessage(state.messages, action.meta.optimisticMessage)
      })
      .addCase(sendChatMessage.fulfilled, (state, action) => {
        state.sendStatus = 'succeeded'
        state.sessions = upsertSession(state.sessions, action.payload.session)
        state.streamingAssistantMessageId = null

        if (isVisibleSession(state, action.payload.session.id)) {
          state.activeSessionId = action.payload.session.id
          state.messages = action.payload.messages
        }
      })
      .addCase(sendChatMessage.rejected, (state, action) => {
        state.sendStatus = 'failed'
        state.error = getErrorMessage(action.error)
        removePendingSendMessages(state, action.meta.requestId)
      })
  }
})

export const { applySendMessageEvent, clearChatError, clearChatMessages } = chatSlice.actions

export const chatReducer = chatSlice.reducer
