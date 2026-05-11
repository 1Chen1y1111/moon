import type { ChatState } from './types'

export function selectChatSessions(state: ChatState): ChatState['sessions'] {
  return state.sessions
}

export function selectChatMessages(state: ChatState): ChatState['messages'] {
  return state.messages
}

export function selectChatSessionsStatus(state: ChatState): ChatState['sessionsStatus'] {
  return state.sessionsStatus
}

export function selectChatMessagesStatus(state: ChatState): ChatState['messagesStatus'] {
  return state.messagesStatus
}

export function selectChatCreateStatus(state: ChatState): ChatState['createStatus'] {
  return state.createStatus
}

export function selectChatSendStatus(state: ChatState): ChatState['sendStatus'] {
  return state.sendStatus
}

export function selectChatError(state: ChatState): string | null {
  return state.error
}
