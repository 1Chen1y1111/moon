// @vitest-environment node

/**
 * 负责验证 server-core sessions RPC 注册层的 channel 映射。
 * 测试使用 fake RPC server，不触发 Electron IPC、WebSocket 或数据库。
 */

import { describe, expect, it, vi } from 'vitest'

import { RPC_CHANNELS } from '@moon/shared/protocol'
import {
  HANDLED_SESSION_CHANNELS,
  registerSessionHandlers,
  type RpcRequestHandler,
  type RpcServerPort,
  type SessionHandlers,
  type SessionRpcRequestContext
} from '@moon/server-core'
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
  TopicRecord,
  ChatOperationEvent
} from '@moon/shared/domain/chat'

type RegisteredHandlers = Map<string, RpcRequestHandler<SessionRpcRequestContext>>

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

function createMessage(role: MessageRecord['role']): MessageRecord {
  return {
    id: `${role}-message-1`,
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    operationId: 'operation-1',
    role,
    content: role === 'user' ? 'hello' : 'ok',
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createToolInvocation(): ToolInvocationRecord {
  return {
    id: 'tool-1',
    operationId: 'operation-1',
    messageId: 'assistant-message-1',
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
  sessionHandlers: SessionHandlers
  values: {
    attachment: ChatAttachmentRecord
    createTurnResult: CreateMessageTurnResult
    messages: MessageRecord[]
    operation: AgentOperationRecord
    runResult: RunChatOperationResult
    sendResult: SendMessageResult
    session: SessionRecord
    thread: ThreadRecord
    toolInvocation: ToolInvocationRecord
    topic: TopicRecord
  }
} {
  const session = createSession()
  const topic = createTopic()
  const thread = createThread()
  const operation = createOperation()
  const userMessage = createMessage('user')
  const assistantMessage = createMessage('assistant')
  const messages = [userMessage, assistantMessage]
  const toolInvocation = createToolInvocation()
  const attachment = createAttachment()
  const createTurnResult = {
    session,
    topic,
    thread,
    operation,
    userMessage,
    assistantMessage
  }
  const runResult = {
    operation,
    messages
  }
  const sendResult = {
    session,
    topic,
    thread,
    operation,
    messages
  }
  const sessionHandlers = {
    listSessions: vi.fn(async () => [session]),
    getMessages: vi.fn(async () => messages),
    listTopics: vi.fn(async () => [topic]),
    listThreads: vi.fn(async () => [thread]),
    createSession: vi.fn(async () => session),
    deleteSession: vi.fn(async () => undefined),
    importAttachment: vi.fn(async () => attachment),
    createMessageTurn: vi.fn(async () => createTurnResult),
    runOperation: vi.fn(async () => runResult),
    sendMessage: vi.fn(async () => sendResult),
    cancelOperation: vi.fn(async () => operation),
    approveToolCall: vi.fn(async () => toolInvocation),
    rejectToolCall: vi.fn(async () => toolInvocation)
  } satisfies SessionHandlers

  return {
    sessionHandlers,
    values: {
      attachment,
      createTurnResult,
      messages,
      operation,
      runResult,
      sendResult,
      session,
      thread,
      toolInvocation,
      topic
    }
  }
}

function createRpcServerFixture() {
  const registeredHandlers: RegisteredHandlers = new Map()
  const server: RpcServerPort<SessionRpcRequestContext> = {
    handle: (channel, handler) => {
      registeredHandlers.set(channel, handler as RpcRequestHandler<SessionRpcRequestContext>)
    }
  }
  const handleSpy = vi.spyOn(server, 'handle')

  return {
    handleSpy,
    registeredHandlers,
    server
  }
}

async function invokeRegisteredHandler(
  registeredHandlers: RegisteredHandlers,
  channel: string,
  input?: unknown,
  context: SessionRpcRequestContext = {}
): Promise<unknown> {
  const handler = registeredHandlers.get(channel)

  if (!handler) {
    throw new Error(`Missing registered handler for ${channel}`)
  }

  return input === undefined ? handler(context) : handler(context, input)
}

describe('registerSessionHandlers', () => {
  it('registers callable session channels without registering the event channel', () => {
    const { sessionHandlers } = createSessionHandlersFixture()
    const { handleSpy, registeredHandlers, server } = createRpcServerFixture()

    registerSessionHandlers(server, { sessionHandlers })

    expect(handleSpy).toHaveBeenCalledTimes(HANDLED_SESSION_CHANNELS.length)
    expect(Array.from(registeredHandlers.keys())).toEqual(HANDLED_SESSION_CHANNELS)
    expect(registeredHandlers.has(RPC_CHANNELS.sessions.event)).toBe(false)
  })

  it('delegates registered RPC calls and emits runtime events through session:event', async () => {
    const { sessionHandlers, values } = createSessionHandlersFixture()
    const { registeredHandlers, server } = createRpcServerFixture()
    const emitSessionEvent = vi.fn()

    registerSessionHandlers(server, { sessionHandlers })

    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.listSessions)
    ).resolves.toEqual([values.session])
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.getMessages, {
        sessionId: 'session-1'
      })
    ).resolves.toEqual(values.messages)
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.listTopics, {
        sessionId: 'session-1'
      })
    ).resolves.toEqual([values.topic])
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.listThreads, {
        topicId: 'topic-1'
      })
    ).resolves.toEqual([values.thread])
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.createSession)
    ).resolves.toBe(values.session)
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.deleteSession, {
        sessionId: 'session-1'
      })
    ).resolves.toBeUndefined()
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.importAttachment, {
        name: 'note.txt',
        mimeType: 'text/plain',
        size: 5,
        data: new TextEncoder().encode('hello')
      })
    ).resolves.toBe(values.attachment)
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.createMessageTurn, {
        content: 'hello'
      })
    ).resolves.toBe(values.createTurnResult)
    await expect(
      invokeRegisteredHandler(
        registeredHandlers,
        RPC_CHANNELS.sessions.runOperation,
        {
          operationId: 'operation-1'
        },
        { emitSessionEvent }
      )
    ).resolves.toBe(values.runResult)
    await expect(
      invokeRegisteredHandler(
        registeredHandlers,
        RPC_CHANNELS.sessions.sendMessage,
        {
          content: 'hello'
        },
        { emitSessionEvent }
      )
    ).resolves.toBe(values.sendResult)
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.cancelOperation, {
        operationId: 'operation-1'
      })
    ).resolves.toBe(values.operation)
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.approveToolCall, {
        toolInvocationId: 'tool-1'
      })
    ).resolves.toBe(values.toolInvocation)
    await expect(
      invokeRegisteredHandler(registeredHandlers, RPC_CHANNELS.sessions.rejectToolCall, {
        toolInvocationId: 'tool-1',
        reason: 'nope'
      })
    ).resolves.toBe(values.toolInvocation)

    expect(sessionHandlers.listSessions).toHaveBeenCalledOnce()
    expect(sessionHandlers.getMessages).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(sessionHandlers.listTopics).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(sessionHandlers.listThreads).toHaveBeenCalledWith({ topicId: 'topic-1' })
    expect(sessionHandlers.createSession).toHaveBeenCalledOnce()
    expect(sessionHandlers.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(sessionHandlers.importAttachment).toHaveBeenCalledWith({
      name: 'note.txt',
      mimeType: 'text/plain',
      size: 5,
      data: expect.any(Uint8Array)
    })
    expect(sessionHandlers.createMessageTurn).toHaveBeenCalledWith({ content: 'hello' })
    expect(sessionHandlers.runOperation).toHaveBeenCalledWith(
      { operationId: 'operation-1' },
      expect.any(Function)
    )
    expect(sessionHandlers.sendMessage).toHaveBeenCalledWith(
      { content: 'hello' },
      expect.any(Function)
    )
    expect(sessionHandlers.cancelOperation).toHaveBeenCalledWith({ operationId: 'operation-1' })
    expect(sessionHandlers.approveToolCall).toHaveBeenCalledWith({
      toolInvocationId: 'tool-1'
    })
    expect(sessionHandlers.rejectToolCall).toHaveBeenCalledWith({
      toolInvocationId: 'tool-1',
      reason: 'nope'
    })

    const event = {
      type: 'message-created',
      operationId: 'operation-1',
      session: values.session,
      topic: values.topic,
      thread: values.thread,
      message: values.messages[0]
    } satisfies ChatOperationEvent
    const runOperationEventSink = vi.mocked(sessionHandlers.runOperation).mock.calls[0][1]
    const sendMessageEventSink = vi.mocked(sessionHandlers.sendMessage).mock.calls[0][1]
    const routeHint = { workspaceId: 'project-1' }

    runOperationEventSink?.(event, routeHint)
    sendMessageEventSink?.(event, routeHint)

    expect(emitSessionEvent).toHaveBeenCalledTimes(2)
    expect(emitSessionEvent).toHaveBeenNthCalledWith(
      1,
      RPC_CHANNELS.sessions.event,
      event,
      routeHint
    )
    expect(emitSessionEvent).toHaveBeenNthCalledWith(
      2,
      RPC_CHANNELS.sessions.event,
      event,
      routeHint
    )
  })
})
