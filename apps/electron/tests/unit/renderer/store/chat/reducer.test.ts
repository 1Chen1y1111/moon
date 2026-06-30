import { describe, expect, it } from 'vitest'

import { createInitialChatState } from '@renderer/store/chat/initial-state'
import { chatReducer } from '@renderer/store/chat/reducer'
import type { ChatState } from '@renderer/store/chat/types'
import type {
  AgentOperationRecord,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'

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

const assistantMessage: MessageRecord = {
  id: 'assistant-1',
  sessionId: 'session-1',
  topicId: 'topic-1',
  threadId: 'thread-1',
  operationId: 'operation-1',
  role: 'assistant',
  content: '',
  status: 'streaming',
  createdAt: '2026-05-09T00:00:02.000Z',
  updatedAt: '2026-05-09T00:00:02.000Z'
}

function createStreamingChatState(message: MessageRecord = assistantMessage): ChatState {
  return {
    ...createInitialChatState(),
    activeSessionId: 'session-1',
    activeTopicId: 'topic-1',
    activeThreadId: 'thread-1',
    messages: [message],
    messageIds: [message.id],
    messagesMap: { [message.id]: message },
    operationsById: {
      [operationOne.id]: {
        id: operationOne.id,
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        assistantMessageId: message.id,
        status: 'running',
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:00:02.000Z'
      }
    }
  }
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
      type: 'applyChatOperationEvent',
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
      type: 'applyChatOperationEvent',
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

  it('removes the optimistic turn when creating a message turn fails', () => {
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
      optimisticUserMessage: {
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
      optimisticAssistantMessage: {
        id: 'pending-assistant-send-request',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        parentId: 'pending-send-request',
        operationId: 'pending-operation-send-request',
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: '2026-05-09T00:00:02.000Z',
        updatedAt: '2026-05-09T00:00:02.000Z'
      },
      optimisticOperation: {
        id: 'pending-operation-send-request',
        appContext: { sessionId: 'session-1' },
        topicId: 'topic-1',
        threadId: 'thread-1',
        status: 'idle',
        createdAt: '2026-05-09T00:00:02.000Z',
        updatedAt: '2026-05-09T00:00:02.000Z'
      },
      requestId: 'send-request'
    })

    expect(state.messages.map((message) => message.content)).toEqual(['continue', ''])

    state = chatReducer(state, {
      type: 'sendChatMessageRejected',
      error: new Error('stream failed'),
      requestId: 'send-request'
    })

    expect(state.messages).toEqual([])
    expect(state.streamingAssistantMessageId).toBeNull()
    expect(state.operationsById['pending-operation-send-request']).toBeUndefined()
  })

  it('removes deleted sessions and clears active chat state', () => {
    const state = chatReducer(
      {
        ...createInitialChatState(),
        activeSessionId: 'session-1',
        activeTopicId: 'topic-1',
        activeThreadId: 'thread-1',
        sessions: [sessionOne],
        topics: [topicOne],
        threads: [threadOne],
        messages: [messageOne],
        messageIds: [messageOne.id],
        messagesMap: { [messageOne.id]: messageOne },
        operationsById: { [operationOne.id]: { ...operationOne, status: 'succeeded' } }
      },
      {
        type: 'deleteChatSessionFulfilled',
        sessionId: 'session-1'
      }
    )

    expect(state.sessions).toEqual([])
    expect(state.activeSessionId).toBeNull()
    expect(state.activeTopicId).toBeNull()
    expect(state.activeThreadId).toBeNull()
    expect(state.messages).toEqual([])
    expect(state.operationsById).toEqual({})
  })
})

describe('chat reducer agent turn metadata', () => {
  it('preserves turn id from message deltas in live assistant message metadata', () => {
    const state = chatReducer(createStreamingChatState(), {
      type: 'applyChatOperationEvent',
      event: {
        type: 'message-delta',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        delta: 'hello',
        turnId: 'operation-1'
      }
    })

    expect(state.messagesMap['assistant-1']?.content).toBe('hello')
    expect(state.messagesMap['assistant-1']?.metadata).toEqual({ agentTurnId: 'operation-1' })
  })

  it('merges turn id from reasoning deltas without dropping existing metadata', () => {
    const state = chatReducer(
      createStreamingChatState({
        ...assistantMessage,
        metadata: { source: 'existing' }
      }),
      {
        type: 'applyChatOperationEvent',
        event: {
          type: 'reasoning-delta',
          operationId: 'operation-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          threadId: 'thread-1',
          messageId: 'assistant-1',
          delta: 'thinking',
          turnId: 'operation-1'
        }
      }
    )

    expect(state.messagesMap['assistant-1']?.reasoning).toBe('thinking')
    expect(state.messagesMap['assistant-1']?.metadata).toEqual({
      source: 'existing',
      agentTurnId: 'operation-1'
    })
  })

  it('does not create empty metadata when delta events do not carry a turn id', () => {
    const state = chatReducer(createStreamingChatState(), {
      type: 'applyChatOperationEvent',
      event: {
        type: 'message-delta',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        delta: 'hello'
      }
    })

    expect(state.messagesMap['assistant-1']?.content).toBe('hello')
    expect(state.messagesMap['assistant-1']?.metadata).toBeUndefined()
  })

  it('keeps tool invocation turn state through tool operation events', () => {
    const startedToolInvocation: ToolInvocationRecord = {
      id: 'tool-1',
      operationId: 'operation-1',
      messageId: 'assistant-1',
      name: 'Bash',
      arguments: { command: 'pwd' },
      state: { agentTurnId: 'operation-1' },
      status: 'running',
      createdAt: '2026-05-09T00:00:03.000Z',
      updatedAt: '2026-05-09T00:00:03.000Z'
    }
    const waitingToolInvocation: ToolInvocationRecord = {
      ...startedToolInvocation,
      status: 'waiting_for_human',
      updatedAt: '2026-05-09T00:00:04.000Z'
    }
    const finishedToolInvocation: ToolInvocationRecord = {
      ...startedToolInvocation,
      result: { stdout: '/workspace' },
      status: 'success',
      updatedAt: '2026-05-09T00:00:05.000Z'
    }

    let state = chatReducer(createStreamingChatState(), {
      type: 'applyChatOperationEvent',
      event: {
        type: 'tool-start',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        toolInvocation: startedToolInvocation,
        turnId: 'operation-1'
      }
    })

    expect(state.messagesMap['assistant-1']?.toolInvocations?.[0]?.state).toEqual({
      agentTurnId: 'operation-1'
    })

    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'tool-waiting-approval',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        toolInvocation: waitingToolInvocation,
        turnId: 'operation-1'
      }
    })

    expect(state.messagesMap['assistant-1']?.toolInvocations?.[0]?.state).toEqual({
      agentTurnId: 'operation-1'
    })
    expect(state.pendingToolInvocations[0]?.state).toEqual({ agentTurnId: 'operation-1' })

    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'tool-finish',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        toolInvocation: finishedToolInvocation,
        turnId: 'operation-1'
      }
    })

    expect(state.messagesMap['assistant-1']?.toolInvocations?.[0]?.state).toEqual({
      agentTurnId: 'operation-1'
    })
    expect(state.pendingToolInvocations).toEqual([])
  })

  it('accepts source activation events without changing live chat state', () => {
    const initialState = createStreamingChatState()
    const stateWithOptionalFields = chatReducer(initialState, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'source-activated',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        sourceSlug: 'workspace',
        originalMessage: 'hello',
        turnId: 'operation-1'
      }
    })
    const stateWithoutOptionalFields = chatReducer(initialState, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'source-activated',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        sourceSlug: 'workspace'
      }
    })

    expect(stateWithOptionalFields).toBe(initialState)
    expect(stateWithoutOptionalFields).toBe(initialState)
  })
})
