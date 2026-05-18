import type { ChatState } from './types'

export function createInitialChatState(): ChatState {
  return {
    activeSessionId: null,
    activeTopicId: null,
    activeThreadId: null,
    activeOperationId: null,
    sessions: [],
    topics: [],
    threads: [],
    messages: [],
    messagesMap: {},
    messageIds: [],
    draftAttachments: [],
    sessionsStatus: 'idle',
    topicsStatus: 'idle',
    threadsStatus: 'idle',
    messagesStatus: 'idle',
    createStatus: 'idle',
    sendStatus: 'idle',
    messagesRequestId: null,
    streamingAssistantMessageId: null,
    pendingToolInvocations: [],
    error: null
  }
}

export const initialChatState = createInitialChatState()
