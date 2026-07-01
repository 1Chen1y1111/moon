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

function createOperationRecord(
  overrides: Partial<AgentOperationRecord> = {}
): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1' },
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:02.000Z',
    ...overrides
  }
}

function createToolInvocation(
  overrides: Partial<ToolInvocationRecord> = {}
): ToolInvocationRecord {
  return {
    id: 'tool-1',
    operationId: 'operation-1',
    messageId: 'assistant-1',
    name: 'Bash',
    arguments: { command: 'pwd' },
    status: 'running',
    createdAt: '2026-05-09T00:00:03.000Z',
    updatedAt: '2026-05-09T00:00:03.000Z',
    ...overrides
  }
}

function createStreamingChatState(message: MessageRecord = assistantMessage): ChatState {
  return {
    ...createInitialChatState(),
    activeSessionId: 'session-1',
    activeTopicId: 'topic-1',
    activeThreadId: 'thread-1',
    activeOperationId: operationOne.id,
    sendStatus: 'sending',
    streamingAssistantMessageId: message.id,
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

describe('chat reducer operation event replay', () => {
  it('replays a complete operation sequence into settled message and operation state', () => {
    const userMessage: MessageRecord = {
      ...messageOne,
      id: 'user-1',
      operationId: 'operation-1',
      content: 'run pwd'
    }
    const startedToolInvocation = createToolInvocation({
      state: { agentTurnId: 'operation-1' }
    })
    const waitingToolInvocation = createToolInvocation({
      state: { agentTurnId: 'operation-1' },
      status: 'waiting_for_human',
      updatedAt: '2026-05-09T00:00:04.000Z'
    })
    const finishedToolInvocation = createToolInvocation({
      state: { agentTurnId: 'operation-1' },
      result: { stdout: '/workspace' },
      status: 'done',
      updatedAt: '2026-05-09T00:00:05.000Z'
    })
    const completedAssistantMessage: MessageRecord = {
      ...assistantMessage,
      content: 'hello world',
      reasoning: 'thinking ',
      status: 'complete',
      metadata: { agentTurnId: 'operation-1' },
      toolInvocations: [finishedToolInvocation],
      updatedAt: '2026-05-09T00:00:06.000Z'
    }

    let state = chatReducer(createInitialChatState(), {
      type: 'applyChatOperationEvent',
      event: {
        type: 'message-created',
        operationId: 'operation-1',
        session: sessionOne,
        topic: topicOne,
        thread: threadOne,
        message: userMessage
      }
    })

    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'operation-started',
        operationId: 'operation-1',
        operation: createOperationRecord()
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
        message: assistantMessage
      }
    })
    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'message-delta',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        delta: 'hello ',
        turnId: 'operation-1'
      }
    })
    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'reasoning-delta',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        delta: 'thinking ',
        turnId: 'operation-1'
      }
    })

    expect(state.messagesMap['assistant-1']).toMatchObject({
      content: 'hello ',
      reasoning: 'thinking ',
      metadata: { agentTurnId: 'operation-1' }
    })

    state = chatReducer(state, {
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

    expect(state.pendingToolInvocations).toEqual([waitingToolInvocation])
    expect(state.operationsById['operation-1']?.status).toBe('waiting_for_human')

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

    expect(state.pendingToolInvocations).toEqual([])
    expect(state.operationsById['operation-1']?.status).toBe('running')

    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'operation-done',
        operationId: 'operation-1',
        session: sessionOne,
        topic: topicOne,
        thread: threadOne,
        operation: createOperationRecord({
          status: 'done',
          completedAt: '2026-05-09T00:00:06.000Z',
          updatedAt: '2026-05-09T00:00:06.000Z'
        }),
        messages: [userMessage, completedAssistantMessage]
      }
    })

    expect(state.messagesMap['assistant-1']).toMatchObject({
      content: 'hello world',
      reasoning: 'thinking ',
      status: 'complete',
      metadata: { agentTurnId: 'operation-1' },
      toolInvocations: [finishedToolInvocation]
    })
    expect(state.operationsById['operation-1']?.status).toBe('succeeded')
    expect(state.pendingToolInvocations).toEqual([])
    expect(state.activeOperationId).toBeNull()
    expect(state.streamingAssistantMessageId).toBeNull()
    expect(state.sendStatus).toBe('succeeded')

    const completedState = state
    const lateErrorState = chatReducer(completedState, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'operation-error',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        error: 'late failure',
        operation: createOperationRecord({
          status: 'error',
          error: { message: 'late failure' },
          updatedAt: '2026-05-09T00:00:07.000Z'
        })
      }
    })

    expect(lateErrorState).toBe(completedState)
  })

  it('maps ordinary operation errors to failed state and clears pending tools', () => {
    const waitingToolInvocation = createToolInvocation({
      status: 'waiting_for_human',
      updatedAt: '2026-05-09T00:00:04.000Z'
    })
    const streamingMessage: MessageRecord = {
      ...assistantMessage,
      toolInvocations: [waitingToolInvocation]
    }
    const state = chatReducer(
      {
        ...createStreamingChatState(streamingMessage),
        pendingToolInvocations: [waitingToolInvocation]
      },
      {
        type: 'applyChatOperationEvent',
        event: {
          type: 'operation-error',
          operationId: 'operation-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          threadId: 'thread-1',
          messageId: 'assistant-1',
          error: 'backend failed',
          operation: createOperationRecord({
            status: 'error',
            error: { message: 'backend failed' },
            updatedAt: '2026-05-09T00:00:05.000Z'
          })
        }
      }
    )

    expect(state.messagesMap['assistant-1']).toMatchObject({
      status: 'error',
      error: 'backend failed'
    })
    expect(state.operationsById['operation-1']).toMatchObject({
      status: 'failed',
      error: 'backend failed'
    })
    expect(state.pendingToolInvocations).toEqual([])
    expect(state.activeOperationId).toBeNull()
    expect(state.streamingAssistantMessageId).toBeNull()
    expect(state.sendStatus).toBe('failed')
    expect(state.error).toBe('backend failed')
  })

  it('maps interrupted operation errors to cancelled state instead of ordinary errors', () => {
    const waitingToolInvocation = createToolInvocation({
      status: 'waiting_for_human',
      updatedAt: '2026-05-09T00:00:04.000Z'
    })
    const streamingMessage: MessageRecord = {
      ...assistantMessage,
      content: 'partial',
      toolInvocations: [waitingToolInvocation]
    }
    const state = chatReducer(
      {
        ...createStreamingChatState(streamingMessage),
        pendingToolInvocations: [waitingToolInvocation]
      },
      {
        type: 'applyChatOperationEvent',
        event: {
          type: 'operation-error',
          operationId: 'operation-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          threadId: 'thread-1',
          messageId: 'assistant-1',
          error: 'Cancelled by user.',
          operation: createOperationRecord({
            status: 'interrupted',
            interruption: {
              canResume: false,
              interruptedAt: '2026-05-09T00:00:05.000Z',
              reason: 'Cancelled by user.'
            },
            updatedAt: '2026-05-09T00:00:05.000Z'
          })
        }
      }
    )

    expect(state.messagesMap['assistant-1']).toMatchObject({
      status: 'cancelled',
      error: 'Cancelled by user.'
    })
    expect(state.operationsById['operation-1']?.status).toBe('cancelled')
    expect(state.pendingToolInvocations).toEqual([])
    expect(state.activeOperationId).toBeNull()
    expect(state.streamingAssistantMessageId).toBeNull()
    expect(state.sendStatus).toBe('failed')
    expect(state.error).toBeNull()
  })

  it('keeps cancelled state stable across local cancel fulfillment and late errors', () => {
    const waitingToolInvocation = createToolInvocation({
      status: 'waiting_for_human',
      updatedAt: '2026-05-09T00:00:04.000Z'
    })
    const streamingMessage: MessageRecord = {
      ...assistantMessage,
      content: 'partial',
      toolInvocations: [waitingToolInvocation]
    }

    let state = chatReducer(
      {
        ...createStreamingChatState(streamingMessage),
        pendingToolInvocations: [waitingToolInvocation],
        error: 'stale error'
      },
      {
        type: 'cancelChatOperationFulfilled',
        operation: createOperationRecord({
          status: 'interrupted',
          interruption: {
            canResume: false,
            interruptedAt: '2026-05-09T00:00:05.000Z',
            reason: 'Cancelled by user.'
          },
          updatedAt: '2026-05-09T00:00:05.000Z'
        })
      }
    )

    expect(state.messagesMap['assistant-1']).toMatchObject({
      status: 'cancelled',
      error: 'Cancelled by user.'
    })
    expect(state.operationsById['operation-1']?.status).toBe('cancelled')
    expect(state.pendingToolInvocations).toEqual([])
    expect(state.streamingAssistantMessageId).toBeNull()
    expect(state.error).toBeNull()

    const cancelledState = state
    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'operation-error',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        error: 'late backend failure',
        operation: createOperationRecord({
          status: 'error',
          error: { message: 'late backend failure' },
          updatedAt: '2026-05-09T00:00:06.000Z'
        })
      }
    })

    expect(state).toBe(cancelledState)
  })
})

describe('chat reducer permission tool cards', () => {
  it('removes pending approvals when tool updates are rejected or errored', () => {
    const waitingToolInvocation = createToolInvocation({
      status: 'waiting_for_human',
      updatedAt: '2026-05-09T00:00:04.000Z'
    })
    const rejectedToolInvocation = createToolInvocation({
      status: 'rejected',
      error: 'Rejected by user.',
      updatedAt: '2026-05-09T00:00:05.000Z'
    })
    const waitingSecondToolInvocation = createToolInvocation({
      id: 'tool-2',
      status: 'waiting_for_human',
      updatedAt: '2026-05-09T00:00:06.000Z'
    })
    const erroredSecondToolInvocation = createToolInvocation({
      id: 'tool-2',
      status: 'error',
      error: 'Command failed.',
      updatedAt: '2026-05-09T00:00:07.000Z'
    })

    let state = chatReducer(createStreamingChatState(), {
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

    expect(state.pendingToolInvocations).toEqual([waitingToolInvocation])

    state = chatReducer(state, {
      type: 'updateChatToolInvocation',
      toolInvocation: rejectedToolInvocation
    })

    expect(state.pendingToolInvocations).toEqual([])
    expect(state.messagesMap['assistant-1']?.toolInvocations?.[0]).toMatchObject({
      status: 'rejected',
      error: 'Rejected by user.'
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
        toolInvocation: waitingSecondToolInvocation,
        turnId: 'operation-1'
      }
    })

    expect(state.pendingToolInvocations).toEqual([waitingSecondToolInvocation])

    state = chatReducer(state, {
      type: 'applyChatOperationEvent',
      event: {
        type: 'tool-finish',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'assistant-1',
        toolInvocation: erroredSecondToolInvocation,
        turnId: 'operation-1'
      }
    })

    expect(state.pendingToolInvocations).toEqual([])
    expect(state.messagesMap['assistant-1']?.toolInvocations?.[1]).toMatchObject({
      status: 'error',
      error: 'Command failed.'
    })
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
      status: 'done',
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
