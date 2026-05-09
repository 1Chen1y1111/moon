import type { ChatState } from './chat.types'

type ChatSliceState = {
  chat: ChatState
}

export function selectChatSessions(state: ChatSliceState): ChatState['sessions'] {
  return state.chat.sessions
}

export function selectChatMessages(state: ChatSliceState): ChatState['messages'] {
  return state.chat.messages
}

export function selectChatSessionsStatus(state: ChatSliceState): ChatState['sessionsStatus'] {
  return state.chat.sessionsStatus
}

export function selectChatMessagesStatus(state: ChatSliceState): ChatState['messagesStatus'] {
  return state.chat.messagesStatus
}

export function selectChatCreateStatus(state: ChatSliceState): ChatState['createStatus'] {
  return state.chat.createStatus
}

export function selectChatSendStatus(state: ChatSliceState): ChatState['sendStatus'] {
  return state.chat.sendStatus
}

export function selectChatError(state: ChatSliceState): string | null {
  return state.chat.error
}
