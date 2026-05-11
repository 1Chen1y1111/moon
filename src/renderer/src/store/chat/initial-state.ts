import type { ChatState } from './types'

export function createInitialChatState(): ChatState {
  return {
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
}

export const initialChatState = createInitialChatState()
