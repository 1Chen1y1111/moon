import { describe, expect, it } from 'vitest'

import {
  applySendMessageEvent,
  chatReducer,
  loadChatMessages,
  sendChatMessage
} from '@renderer/entities/chat'
import type { MessageRecord, SessionRecord } from '@shared/domain/chat'

const sessionOne: SessionRecord = {
  id: 'session-1',
  projectId: null,
  provider: 'openai',
  title: '会话一',
  status: 'active',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

const messageOne: MessageRecord = {
  id: 'message-1',
  sessionId: 'session-1',
  role: 'user',
  content: '来自会话一',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

const messageTwo: MessageRecord = {
  id: 'message-2',
  sessionId: 'session-2',
  role: 'user',
  content: '来自会话二',
  createdAt: '2026-05-09T00:00:01.000Z',
  updatedAt: '2026-05-09T00:00:01.000Z'
}

describe('chatReducer message ownership', () => {
  it('ignores stale message loads after switching sessions', () => {
    let state = chatReducer(undefined, loadChatMessages.pending('request-a', 'session-1'))

    state = chatReducer(state, loadChatMessages.pending('request-b', 'session-2'))
    state = chatReducer(state, loadChatMessages.fulfilled([messageOne], 'request-a', 'session-1'))

    expect(state.activeSessionId).toBe('session-2')
    expect(state.messagesStatus).toBe('loading')
    expect(state.messages).toEqual([])

    state = chatReducer(state, loadChatMessages.fulfilled([messageTwo], 'request-b', 'session-2'))

    expect(state.messagesStatus).toBe('succeeded')
    expect(state.messages).toEqual([messageTwo])
  })

  it('does not apply stream events for a different active session', () => {
    let state = chatReducer(undefined, loadChatMessages.pending('request-b', 'session-2'))

    state = chatReducer(state, loadChatMessages.fulfilled([messageTwo], 'request-b', 'session-2'))
    state = chatReducer(
      state,
      applySendMessageEvent({
        type: 'user-message',
        session: sessionOne,
        message: messageOne
      })
    )
    state = chatReducer(
      state,
      applySendMessageEvent({
        type: 'assistant-start',
        message: {
          id: 'assistant-1',
          sessionId: 'session-1',
          role: 'assistant',
          content: '',
          createdAt: '2026-05-09T00:00:02.000Z',
          updatedAt: '2026-05-09T00:00:02.000Z'
        }
      })
    )

    expect(state.sessions).toContainEqual(sessionOne)
    expect(state.messages).toEqual([messageTwo])
  })

  it('does not replace visible messages when a send from another session completes', () => {
    let state = chatReducer(undefined, loadChatMessages.pending('request-b', 'session-2'))

    state = chatReducer(state, loadChatMessages.fulfilled([messageTwo], 'request-b', 'session-2'))
    state = chatReducer(
      state,
      sendChatMessage.fulfilled(
        {
          session: sessionOne,
          messages: [messageOne]
        },
        'send-request',
        { sessionId: 'session-1', content: '来自会话一' }
      )
    )

    expect(state.sendStatus).toBe('succeeded')
    expect(state.sessions).toContainEqual(sessionOne)
    expect(state.messages).toEqual([messageTwo])
  })

  it('removes the streamed assistant draft when sending fails', () => {
    let state = chatReducer(undefined, loadChatMessages.pending('load-request', 'session-1'))

    state = chatReducer(state, loadChatMessages.fulfilled([], 'load-request', 'session-1'))
    state = chatReducer(
      state,
      sendChatMessage.pending(
        'send-request',
        { sessionId: 'session-1', content: '继续' },
        {
          optimisticMessage: {
            id: 'pending-send-request',
            sessionId: 'session-1',
            role: 'user',
            content: '继续',
            createdAt: '2026-05-09T00:00:02.000Z',
            updatedAt: '2026-05-09T00:00:02.000Z'
          }
        }
      )
    )
    state = chatReducer(
      state,
      applySendMessageEvent({
        type: 'user-message',
        session: sessionOne,
        message: {
          ...messageOne,
          id: 'saved-user-message',
          content: '继续'
        }
      })
    )
    state = chatReducer(
      state,
      applySendMessageEvent({
        type: 'assistant-start',
        message: {
          id: 'assistant-streaming',
          sessionId: 'session-1',
          role: 'assistant',
          content: '',
          createdAt: '2026-05-09T00:00:03.000Z',
          updatedAt: '2026-05-09T00:00:03.000Z'
        }
      })
    )
    state = chatReducer(
      state,
      applySendMessageEvent({
        type: 'assistant-delta',
        messageId: 'assistant-streaming',
        delta: '半截回复'
      })
    )

    expect(state.messages.map((message) => message.content)).toEqual(['继续', '半截回复'])

    state = chatReducer(
      state,
      sendChatMessage.rejected(new Error('stream failed'), 'send-request', {
        sessionId: 'session-1',
        content: '继续'
      })
    )

    expect(state.messages.map((message) => message.content)).toEqual(['继续'])
    expect(state.streamingAssistantMessageId).toBeNull()
  })
})
