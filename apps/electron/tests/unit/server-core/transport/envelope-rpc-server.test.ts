// @vitest-environment node

/**
 * 负责验证 server-core EnvelopeRpcServer 的内存调度行为。
 * 测试只使用 fake handler，不触发 Electron IPC、数据库或真实 agent runtime。
 */

import { describe, expect, it, vi } from 'vitest'

import { registerSessionHandlers } from '@moon/server-core/handlers/rpc'
import { EnvelopeRpcServer } from '@moon/server-core/transport'
import type { SessionHandlers } from '@moon/server-core/sessions'
import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
  CreateMessageTurnResult,
  MessageRecord,
  RunChatOperationResult,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import { CodedError } from '@moon/shared/protocol'
import { RPC_CHANNELS } from '@moon/shared/protocol'

const timestamp = '2026-05-09T00:00:00.000Z'

function createSession(): SessionRecord {
  return {
    id: 'session-1',
    projectId: null,
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createTopic(): TopicRecord {
  return {
    id: 'topic-1',
    sessionId: 'session-1',
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createThread(): ThreadRecord {
  return {
    id: 'thread-1',
    topicId: 'topic-1',
    title: 'Moon',
    type: 'standalone',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createOperation(): AgentOperationRecord {
  return {
    id: 'operation-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'done',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createMessage(): MessageRecord {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    operationId: 'operation-1',
    role: 'assistant',
    content: 'ok',
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createToolInvocation(): ToolInvocationRecord {
  return {
    id: 'tool-1',
    operationId: 'operation-1',
    messageId: 'message-1',
    name: 'tool',
    arguments: {},
    status: 'done',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createAttachment(): ChatAttachmentRecord {
  return {
    id: 'attachment-1',
    name: 'note.txt',
    mimeType: 'text/plain',
    size: 5,
    kind: 'file',
    createdAt: timestamp
  }
}

function createSessionHandlersFixture(): {
  session: SessionRecord
  sessionHandlers: SessionHandlers
} {
  const session = createSession()
  const topic = createTopic()
  const thread = createThread()
  const operation = createOperation()
  const message = createMessage()
  const toolInvocation = createToolInvocation()
  const attachment = createAttachment()
  const createTurnResult = {
    session,
    topic,
    thread,
    operation,
    userMessage: { ...message, id: 'user-message-1', role: 'user', content: 'hello' },
    assistantMessage: message
  } satisfies CreateMessageTurnResult
  const runResult = {
    operation,
    messages: [message]
  } satisfies RunChatOperationResult
  const sendResult = {
    session,
    topic,
    thread,
    operation,
    messages: [message]
  } satisfies SendMessageResult

  return {
    session,
    sessionHandlers: {
      listSessions: vi.fn(async () => [session]),
      getMessages: vi.fn(async () => [message]),
      listTopics: vi.fn(async () => [topic]),
      listThreads: vi.fn(async () => [thread]),
      activateThread: vi.fn(async () => thread),
      createSession: vi.fn(async () => session),
      deleteSession: vi.fn(async () => undefined),
      importAttachment: vi.fn(async () => attachment),
      createMessageTurn: vi.fn(async () => createTurnResult),
      runOperation: vi.fn(async () => runResult),
      sendMessage: vi.fn(async () => sendResult),
      cancelOperation: vi.fn(async () => operation),
      approveToolCall: vi.fn(async () => toolInvocation),
      rejectToolCall: vi.fn(async () => toolInvocation)
    }
  }
}

describe('EnvelopeRpcServer', () => {
  it('dispatches request envelopes to registered handlers', async () => {
    const server = new EnvelopeRpcServer<{ userId: string }>()

    server.handle('demo:echo', (context, input: string) => ({
      input,
      userId: context.userId
    }))

    await expect(
      server.dispatch(
        { userId: 'user-1' },
        {
          id: 'request-1',
          type: 'request',
          channel: 'demo:echo',
          args: ['hello']
        }
      )
    ).resolves.toEqual({
      id: 'request-1',
      type: 'response',
      channel: 'demo:echo',
      result: {
        input: 'hello',
        userId: 'user-1'
      }
    })
  })

  it('returns CHANNEL_NOT_FOUND when request channel is missing or unregistered', async () => {
    const server = new EnvelopeRpcServer()

    await expect(
      server.dispatch(undefined, {
        id: 'request-1',
        type: 'request'
      })
    ).resolves.toEqual({
      id: 'request-1',
      type: 'response',
      error: {
        code: 'CHANNEL_NOT_FOUND',
        message: 'Missing channel'
      }
    })
    await expect(
      server.dispatch(undefined, {
        id: 'request-2',
        type: 'request',
        channel: 'missing'
      })
    ).resolves.toEqual({
      id: 'request-2',
      type: 'response',
      channel: 'missing',
      error: {
        code: 'CHANNEL_NOT_FOUND',
        message: 'No handler for: missing'
      }
    })
  })

  it('wraps ordinary handler errors as HANDLER_ERROR', async () => {
    const server = new EnvelopeRpcServer()

    server.handle('demo:fail', () => {
      throw new Error('boom')
    })

    await expect(
      server.dispatch(undefined, {
        id: 'request-1',
        type: 'request',
        channel: 'demo:fail'
      })
    ).resolves.toEqual({
      id: 'request-1',
      type: 'response',
      channel: 'demo:fail',
      error: {
        code: 'HANDLER_ERROR',
        message: 'boom'
      }
    })
  })

  it('preserves CodedError codes thrown by handlers', async () => {
    const server = new EnvelopeRpcServer()

    server.handle('demo:timeout', () => {
      throw new CodedError('REQUEST_TIMEOUT', 'too slow')
    })

    await expect(
      server.dispatch(undefined, {
        id: 'request-1',
        type: 'request',
        channel: 'demo:timeout'
      })
    ).resolves.toEqual({
      id: 'request-1',
      type: 'response',
      channel: 'demo:timeout',
      error: {
        code: 'REQUEST_TIMEOUT',
        message: 'too slow'
      }
    })
  })

  it('dispatches registered session handlers through envelopes', async () => {
    const server = new EnvelopeRpcServer()
    const { session, sessionHandlers } = createSessionHandlersFixture()

    registerSessionHandlers(server, { sessionHandlers })

    await expect(
      server.dispatch(
        {},
        {
          id: 'request-1',
          type: 'request',
          channel: RPC_CHANNELS.sessions.listSessions
        }
      )
    ).resolves.toEqual({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.listSessions,
      result: [session]
    })
    expect(sessionHandlers.listSessions).toHaveBeenCalledOnce()
  })
})
