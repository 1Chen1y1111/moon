// @vitest-environment node

/**
 * 负责验证 server-core sessions handler 入口层只做运行时委托。
 * 测试不触发 Electron、IPC、数据库或真实 agent backend。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  createSessionHandlers,
  type SessionEventSink,
  type SessionHandlerRuntime
} from '@moon/server-core/sessions'
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

function createRuntimeFixture(): {
  runtime: SessionHandlerRuntime
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
  const runtime = {
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
  } satisfies SessionHandlerRuntime

  return {
    runtime,
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

describe('createSessionHandlers', () => {
  it('delegates session CRUD and message reads to SessionManager runtime', async () => {
    const { runtime, values } = createRuntimeFixture()
    const handlers = createSessionHandlers({ sessionManager: runtime })

    await expect(handlers.listSessions()).resolves.toEqual([values.session])
    await expect(handlers.getMessages({ sessionId: 'session-1' })).resolves.toEqual(
      values.messages
    )
    await expect(handlers.listTopics({ sessionId: 'session-1' })).resolves.toEqual([values.topic])
    await expect(handlers.listThreads({ topicId: 'topic-1' })).resolves.toEqual([values.thread])
    await expect(handlers.createSession()).resolves.toBe(values.session)
    await expect(handlers.deleteSession({ sessionId: 'session-1' })).resolves.toBeUndefined()
    await expect(
      handlers.importAttachment({
        name: 'note.txt',
        mimeType: 'text/plain',
        size: 5,
        data: new TextEncoder().encode('hello')
      })
    ).resolves.toBe(values.attachment)

    expect(runtime.listSessions).toHaveBeenCalledOnce()
    expect(runtime.getMessages).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(runtime.listTopics).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(runtime.listThreads).toHaveBeenCalledWith({ topicId: 'topic-1' })
    expect(runtime.createSession).toHaveBeenCalledOnce()
    expect(runtime.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(runtime.importAttachment).toHaveBeenCalledWith({
      name: 'note.txt',
      mimeType: 'text/plain',
      size: 5,
      data: expect.any(Uint8Array)
    })
  })

  it('delegates operation handlers and preserves event sinks', async () => {
    const { runtime, values } = createRuntimeFixture()
    const handlers = createSessionHandlers({ sessionManager: runtime })
    const eventSink = vi.fn() satisfies SessionEventSink

    await expect(handlers.createMessageTurn({ content: 'hello' })).resolves.toBe(
      values.createTurnResult
    )
    await expect(handlers.runOperation({ operationId: 'operation-1' }, eventSink)).resolves.toBe(
      values.runResult
    )
    await expect(handlers.sendMessage({ content: 'hello' }, eventSink)).resolves.toBe(
      values.sendResult
    )
    await expect(handlers.cancelOperation({ operationId: 'operation-1' })).resolves.toBe(
      values.operation
    )
    await expect(handlers.approveToolCall({ toolInvocationId: 'tool-1' })).resolves.toBe(
      values.toolInvocation
    )
    await expect(
      handlers.rejectToolCall({ toolInvocationId: 'tool-1', reason: 'nope' })
    ).resolves.toBe(values.toolInvocation)

    expect(runtime.createMessageTurn).toHaveBeenCalledWith({ content: 'hello' })
    expect(runtime.runOperation).toHaveBeenCalledWith({ operationId: 'operation-1' }, eventSink)
    expect(runtime.sendMessage).toHaveBeenCalledWith({ content: 'hello' }, eventSink)
    expect(runtime.cancelOperation).toHaveBeenCalledWith({ operationId: 'operation-1' })
    expect(runtime.approveToolCall).toHaveBeenCalledWith({ toolInvocationId: 'tool-1' })
    expect(runtime.rejectToolCall).toHaveBeenCalledWith({
      toolInvocationId: 'tool-1',
      reason: 'nope'
    })
  })
})
