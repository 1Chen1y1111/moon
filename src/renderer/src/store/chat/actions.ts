import type { MessageRecord, SendMessageEvent, SendMessageResult } from '@shared/domain/chat'
import type { SendChatMessageInput } from '@shared/domain/chat-validation'

import type { StoreSetter } from '@renderer/store/types'

import { chatReducer, type ChatReducerAction } from './reducer'
import type { ChatStore } from './store'

type Setter = StoreSetter<ChatStore>

let requestCounter = 0

function createRequestId(prefix: string): string {
  requestCounter += 1
  return `${prefix}-${requestCounter}`
}

function createOptimisticMessage(input: SendChatMessageInput, requestId: string): MessageRecord {
  const timestamp = new Date().toISOString()

  return {
    id: `pending-${requestId}`,
    sessionId: input.sessionId ?? `pending-session-${requestId}`,
    role: 'user',
    content: input.content.trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export class ChatActionImpl {
  readonly #set: Setter

  constructor(set: Setter, _get: () => ChatStore, _api?: unknown) {
    void _get
    void _api
    this.#set = set
  }

  clearChatMessages = (): void => {
    this.internal_clearChatMessages()
  }

  clearChatError = (): void => {
    this.internal_clearChatError()
  }

  applySendMessageEvent = (event: SendMessageEvent): void => {
    this.internal_applySendMessageEvent(event)
  }

  loadChatSessions = () => this.internal_loadChatSessions()

  loadChatMessages = (sessionId: string) => this.internal_loadChatMessages(sessionId)

  createChatSession = () => this.internal_createChatSession()

  sendChatMessage = (input: SendChatMessageInput): Promise<SendMessageResult> =>
    this.internal_sendChatMessage(input)

  internal_clearChatMessages = (): void => {
    this.internal_dispatchChat({ type: 'clearChatMessages' })
  }

  internal_clearChatError = (): void => {
    this.internal_dispatchChat({ type: 'clearChatError' })
  }

  internal_applySendMessageEvent = (event: SendMessageEvent): void => {
    this.internal_dispatchChat({ type: 'applySendMessageEvent', event })
  }

  internal_loadChatSessions = async () => {
    this.internal_dispatchChat({ type: 'loadChatSessionsPending' })

    try {
      const sessions = await window.api.chat.listSessions()
      this.internal_dispatchChat({ type: 'loadChatSessionsFulfilled', sessions })
      return sessions
    } catch (error) {
      this.internal_dispatchChat({ type: 'loadChatSessionsRejected', error })
      throw error
    }
  }

  internal_loadChatMessages = async (sessionId: string) => {
    const requestId = createRequestId('load-messages')
    this.internal_dispatchChat({ type: 'loadChatMessagesPending', sessionId, requestId })

    try {
      const messages = await window.api.chat.getMessages({ sessionId })
      this.internal_dispatchChat({
        type: 'loadChatMessagesFulfilled',
        sessionId,
        requestId,
        messages
      })
      return messages
    } catch (error) {
      this.internal_dispatchChat({
        type: 'loadChatMessagesRejected',
        sessionId,
        requestId,
        error
      })
      throw error
    }
  }

  internal_createChatSession = async () => {
    this.internal_dispatchChat({ type: 'createChatSessionPending' })

    try {
      const session = await window.api.chat.createSession()
      this.internal_dispatchChat({ type: 'createChatSessionFulfilled', session })
      return session
    } catch (error) {
      this.internal_dispatchChat({ type: 'createChatSessionRejected', error })
      throw error
    }
  }

  internal_sendChatMessage = async (input: SendChatMessageInput): Promise<SendMessageResult> => {
    const requestId = createRequestId('send-message')
    const optimisticMessage = createOptimisticMessage(input, requestId)

    this.internal_dispatchChat({
      type: 'sendChatMessagePending',
      input,
      requestId,
      optimisticMessage
    })

    try {
      const result = await window.api.chat.sendMessage(input)
      this.internal_dispatchChat({ type: 'sendChatMessageFulfilled', result })
      return result
    } catch (error) {
      this.internal_dispatchChat({ type: 'sendChatMessageRejected', requestId, error })
      throw error
    }
  }

  internal_dispatchChat = (action: ChatReducerAction): void => {
    this.#set((state) => chatReducer(state, action))
  }
}

export type ChatAction = Pick<ChatActionImpl, keyof ChatActionImpl>

export const createChatSlice = (set: Setter, get: () => ChatStore, api?: unknown): ChatActionImpl =>
  new ChatActionImpl(set, get, api)
