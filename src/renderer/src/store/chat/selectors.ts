import type { ChatAttachmentRecord } from '@shared/domain/chat'

import type { ChatState } from './types'

export function selectChatSessions(state: ChatState): ChatState['sessions'] {
  return state.sessions
}

export function selectChatMessages(state: ChatState): ChatState['messages'] {
  return state.messages
}

export function selectChatDraftAttachments(state: ChatState): ChatState['draftAttachments'] {
  return state.draftAttachments
}

export function selectReadyChatDraftAttachments(state: ChatState): ChatAttachmentRecord[] {
  return state.draftAttachments
    .filter((attachment) => attachment.status === 'success')
    .map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      createdAt: attachment.createdAt
    }))
}

export function selectChatSessionsStatus(state: ChatState): ChatState['sessionsStatus'] {
  return state.sessionsStatus
}

export function selectChatTopics(state: ChatState): ChatState['topics'] {
  return state.topics
}

export function selectChatThreads(state: ChatState): ChatState['threads'] {
  return state.threads
}

export function selectChatActiveThreadId(state: ChatState): string | null {
  return state.activeThreadId
}

export function selectChatActiveOperationId(state: ChatState): string | null {
  return state.activeOperationId
}

export function selectPendingToolInvocations(
  state: ChatState
): ChatState['pendingToolInvocations'] {
  return state.pendingToolInvocations
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
