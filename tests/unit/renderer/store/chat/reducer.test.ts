import { describe, expect, it } from 'vitest'

import { createInitialChatState } from '@renderer/store/chat/initial-state'
import { chatReducer } from '@renderer/store/chat/reducer'
import type {
  AgentOperationRecord,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@shared/domain/chat'

const sessionOne: SessionRecord = {
  id: 'session-1',
  projectId: null,
  provider: 'openai',
  title: 'Session one',
  status: 'active',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

const topicOne: TopicRecord = {
  id: 'topic-1',
  sessionId: 'session-1',
  title: 'Topic one',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

const threadOne: ThreadRecord = {
  id: 'thread-1',
  topicId: 'topic-1',
  title: 'Thread one',
  type: 'standalone',
  status: 'active',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

const operationOne: AgentOperationRecord = {
  id: 'operation-1',
  appContext: { sessionId: 'session-1' },
  topicId: 'topic-1',
  threadId: 'thread-1',
  status: 'done',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:01.000Z',
  completedAt: '2026-05-09T00:00:01.000Z'
}

const messageOne: MessageRecord = {
  id: 'message-1',
  sessionId: 'session-1',
  topicId: 'topic-1',
  threadId: 'thread-1',
  role: 'user',
  content: 'from session one',
  status: 'complete',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

const messageTwo: MessageRecord = {
  id: 'message-2',
  sessionId: 'session-2',
  topicId: 'topic-2',
  threadId: 'thread-2',
  role: 'user',
  content: 'from session two',
  status: 'complete',
  createdAt: '2026-05-09T00:00:01.000Z',
  updatedAt: '2026-05-09T00:00:01.000Z'
}

describe('chat reducer message ownership', () => {
  it('ignores stale message loads after switching sessions', () => {
    let state = chatReducer(createInitialChatState(), {
      type: 'loadChatMessagesPending',
      requestId: 'request-a',
      sessionId: 'session-1',
      threadId: 'thread-1'
    })

    state = chatReducer(state, {
      type: 'loadChatMessagesPending',
      requestId: 'request-b',
      sessionId: 'session-2',
      threadId: 'thread-2'
    })
    state = chatReducer(state, {
      type: 'loadChatMessagesFulfilled',
      messages: [messageOne],
      requestId: 'request-a',
      sessionId: 'session-1',
      threadId: 'thread-1'
    })

    expect(state.activeSessionId).toBe('session-2')
    expect(state.messagesStatus).toBe('loading')
    expect(state.messages).toEqual([])

    state = chatReducer(state, {
      type: 'loadChatMessagesFulfilled',
      messages: [messageTwo],
      requestId: 'request-b',
      sessionId: 'session-2',
      threadId: 'thread-2'
    })

    expect(state.messagesStatus).toBe('succeeded')
    expect(state.messages).toEqual([messageTwo])
  })

  it('does not apply stream events for a different active session', () => {
    let state = chatReducer(createInitialChatState(), {
      type: 'loadChatMessagesPending',
      requestId: 'request-b',
      sessionId: 'session-2',
      threadId: 'thread-2'
    })

    state = chatReducer(state, {
      type: 'loadChatMessagesFulfilled',
      messages: [messageTwo],
      requestId: 'request-b',
      sessionId: 'session-2',
      threadId: 'thread-2'
    })
    state = chatReducer(state, {
      type: 'applySendMessageEvent',
      event: {
        type: 'message-created',
        operationId: 'operation-1',
        session: sessionOne,
        topic: topicOne,
        thread: threadOne,
        message: messageOne
      }
    })
    state = chatReducer(state, {
      type: 'applySendMessageEvent',
      event: {
        type: 'message-created',
        operationId: 'operation-1',
        session: sessionOne,
        topic: topicOne,
        thread: threadOne,
        message: {
          id: 'assistant-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          threadId: 'thread-1',
          role: 'assistant',
          content: '',
          status: 'streaming',
          createdAt: '2026-05-09T00:00:02.000Z',
          updatedAt: '2026-05-09T00:00:02.000Z'
        }
      }
    })

    expect(state.sessions).toContainEqual(sessionOne)
    expect(state.messages).toEqual([messageTwo])
  })

  it('does not replace visible messages when a send from another session completes', () => {
    let state = chatReducer(createInitialChatState(), {
      type: 'loadChatMessagesPending',
      requestId: 'request-b',
      sessionId: 'session-2',
      threadId: 'thread-2'
    })

    state = chatReducer(state, {
      type: 'loadChatMessagesFulfilled',
      messages: [messageTwo],
      requestId: 'request-b',
      sessionId: 'session-2',
      threadId: 'thread-2'
    })
    state = chatReducer(state, {
      type: 'sendChatMessageFulfilled',
      result: {
        session: sessionOne,
        topic: topicOne,
        thread: threadOne,
        operation: operationOne,
        messages: [messageOne]
      }
    })

    expect(state.sendStatus).toBe('succeeded')
    expect(state.sessions).toContainEqual(sessionOne)
    expect(state.messages).toEqual([messageTwo])
  })

  it('removes the streamed assistant draft when sending fails', () => {
    let state = chatReducer(createInitialChatState(), {
      type: 'loadChatMessagesPending',
      requestId: 'load-request',
      sessionId: 'session-1',
      threadId: 'thread-1'
    })

    state = chatReducer(state, {
      type: 'loadChatMessagesFulfilled',
      messages: [],
      requestId: 'load-request',
      sessionId: 'session-1',
      threadId: 'thread-1'
    })
    state = chatReducer(state, {
      type: 'sendChatMessagePending',
      input: { sessionId: 'session-1', content: 'continue' },
      optimisticMessage: {
        id: 'pending-send-request',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        role: 'user',
        content: 'continue',
        status: 'pending',
        createdAt: '2026-05-09T00:00:02.000Z',
        updatedAt: '2026-05-09T00:00:02.000Z'
      },
      requestId: 'send-request'
    })
    state = chatReducer(state, {
      type: 'applySendMessageEvent',
      event: {
        type: 'message-created',
        operationId: 'operation-1',
        session: sessionOne,
        topic: topicOne,
        thread: threadOne,
        message: {
          ...messageOne,
          id: 'saved-user-message',
          content: 'continue'
        }
      }
    })
    state = chatReducer(state, {
      type: 'applySendMessageEvent',
      event: {
        type: 'message-created',
        operationId: 'operation-1',
        session: sessionOne,
        topic: topicOne,
        thread: threadOne,
        message: {
          id: 'assistant-streaming',
          sessionId: 'session-1',
          topicId: 'topic-1',
          threadId: 'thread-1',
          role: 'assistant',
          content: '',
          status: 'streaming',
          createdAt: '2026-05-09T00:00:03.000Z',
          updatedAt: '2026-05-09T00:00:03.000Z'
        }
      }
    })
    state = chatReducer(state, {
      type: 'applySendMessageEvent',
      event: {
        type: 'message-delta',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-streaming',
        delta: 'partial answer'
      }
    })

    expect(state.messages.map((message) => message.content)).toEqual(['continue', 'partial answer'])

    state = chatReducer(state, {
      type: 'sendChatMessageRejected',
      error: new Error('stream failed'),
      requestId: 'send-request'
    })

    expect(state.messages.map((message) => message.content)).toEqual(['continue'])
    expect(state.streamingAssistantMessageId).toBeNull()
  })
})
