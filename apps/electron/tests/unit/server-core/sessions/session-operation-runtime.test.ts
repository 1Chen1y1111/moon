// @vitest-environment node

/**
 * 负责验证 SessionOperationRuntime 的单次 operation 执行闭环。
 * 测试只覆盖已启动 operation 的 backend 执行、事件应用和 done/error 收尾。
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  MessageAttachment
} from '@moon/shared/agent'
import { createDefaultLlmConnection } from '@moon/shared/config'
import type {
  AgentOperationRecord,
  ChatOperationEvent,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import type { SessionEventRouteHint } from '@moon/server-core/sessions/handlers'
import { SessionAgentEventApplier } from '@moon/server-core/sessions/session-agent-event-applier'
import {
  SessionAgentRuntime,
  type SessionSourceProviderScope
} from '@moon/server-core/sessions/session-agent-runtime'
import { SessionOperationRuntime } from '@moon/server-core/sessions/session-operation-runtime'
import { SessionToolPermissionRuntime } from '@moon/server-core/sessions/session-tool-permission-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'
const routeHint: SessionEventRouteHint = { workspaceId: 'project-1' }
const connection = {
  ...createDefaultLlmConnection('anthropic'),
  id: 'connection-1',
  name: 'Claude',
  apiKey: 'test-key'
}

type EventCall = [ChatOperationEvent, SessionEventRouteHint | undefined]

/**
 * 创建 operation runtime 测试所需的最小会话 scope。
 */
function createScope(): SessionSourceProviderScope {
  const project: ProjectRecord = {
    id: 'project-1',
    name: 'Moon',
    path: '/workspace/moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const session: SessionRecord = {
    id: 'session-1',
    projectId: project.id,
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const topic: TopicRecord = {
    id: 'topic-1',
    sessionId: session.id,
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const thread: ThreadRecord = {
    id: 'thread-1',
    topicId: topic.id,
    title: '主线',
    type: 'standalone',
    createdAt: timestamp,
    updatedAt: timestamp
  }

  return { project, session, topic, thread }
}

/**
 * 创建 operation 执行测试使用的持久化 operation。
 */
function createOperation(overrides: Partial<AgentOperationRecord> = {}): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1' },
    provider: 'claude',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 thread history 中的消息记录。
 */
function createMessage(role: MessageRecord['role'], overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: `${role}-message-1`,
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    operationId: 'operation-1',
    role,
    content: role === 'user' ? 'hello' : '',
    status: role === 'user' ? 'complete' : 'streaming',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建满足 AgentBackend contract 的可控事件流 backend。
 */
function createBackend(events: AgentEvent[], throwError?: Error): AgentBackend {
  return {
    async *chat(): AsyncGenerator<AgentEvent, void, void> {
      if (throwError !== undefined) {
        throw throwError
      }

      for (const event of events) {
        yield event
      }
    },
    abort: vi.fn(async () => undefined),
    destroy: vi.fn(),
    getModel: vi.fn(() => 'claude-sonnet-4-6'),
    isProcessing: vi.fn(() => false),
    respondToPermission: vi.fn(),
    setModel: vi.fn()
  }
}

/**
 * 创建 operation runtime 测试使用的内存仓储和协作者。
 */
function createRuntimeFixture(input: {
  attachmentsDirectory?: string
  backend?: AgentBackend
  events?: AgentEvent[]
  operation?: AgentOperationRecord
  throwError?: Error
  userMessage?: MessageRecord
} = {}): {
  agentRuntime: SessionAgentRuntime
  assistantMessage: MessageRecord
  backend: AgentBackend
  capturedConfigs: AgentBackendConfig[]
  events: EventCall[]
  messages: Map<string, MessageRecord>
  onEvent: (event: ChatOperationEvent, hint?: SessionEventRouteHint) => void
  operation: AgentOperationRecord
  operations: Map<string, AgentOperationRecord>
  recordActivatedSource: ReturnType<typeof vi.fn>
  runtime: SessionOperationRuntime
  scope: SessionSourceProviderScope
  sessions: Map<string, SessionRecord>
  toolPermissionRuntime: SessionToolPermissionRuntime
  tools: Map<string, ToolInvocationRecord>
} {
  const scope = createScope()
  const operation = input.operation ?? createOperation()
  const userMessage = input.userMessage ?? createMessage('user')
  const assistantMessage = createMessage('assistant')
  const operations = new Map([[operation.id, operation]])
  const messages = new Map([
    [userMessage.id, userMessage],
    [assistantMessage.id, assistantMessage]
  ])
  const sessions = new Map([[scope.session.id, scope.session]])
  const threads = new Map([[scope.thread.id, scope.thread]])
  const tools = new Map<string, ToolInvocationRecord>()
  const events: EventCall[] = []
  const capturedConfigs: AgentBackendConfig[] = []
  const backend = input.backend ?? createBackend(input.events ?? [], input.throwError)
  const agentRuntime = new SessionAgentRuntime({
    createAgentBackend: vi.fn((config) => {
      capturedConfigs.push(config)

      return backend
    })
  })
  const toolPermissionRuntime = new SessionToolPermissionRuntime({
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (nextOperation) => {
        operations.set(nextOperation.id, nextOperation)

        return nextOperation
      }
    },
    toolInvocationsRepository: {
      findById: async (id) => tools.get(id) ?? null,
      save: async (toolInvocation) => {
        tools.set(toolInvocation.id, toolInvocation)

        return toolInvocation
      }
    }
  })
  const recordActivatedSource = vi.fn()
  const agentEventApplier = new SessionAgentEventApplier({
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (nextOperation) => {
        operations.set(nextOperation.id, nextOperation)

        return nextOperation
      }
    },
    clearProviderSessionId: (threadId) => agentRuntime.clearProviderSessionId(threadId),
    clearPendingToolPermission: (toolInvocationId) =>
      toolPermissionRuntime.clearPendingToolPermission(toolInvocationId),
    messagesRepository: {
      listByOperation: async (operationId) =>
        [...messages.values()].filter((message) => message.operationId === operationId),
      listByThread: async (threadId) =>
        [...messages.values()].filter((message) => message.threadId === threadId),
      save: async (message) => {
        messages.set(message.id, message)

        return message
      }
    },
    recordActivatedSource,
    recordProviderSessionId: (threadId, providerSessionId) =>
      agentRuntime.recordProviderSessionId(threadId, providerSessionId),
    threadsRepository: {
      findById: async (id) => threads.get(id) ?? null,
      listBySession: async () => [...threads.values()],
      listByTopic: async (topicId) =>
        [...threads.values()].filter((thread) => thread.topicId === topicId),
      save: async (thread) => {
        threads.set(thread.id, thread)

        return thread
      }
    },
    toolInvocationsRepository: {
      findById: async (id) => tools.get(id) ?? null,
      save: async (toolInvocation) => {
        tools.set(toolInvocation.id, toolInvocation)

        return toolInvocation
      }
    },
    trackPendingToolPermission: (toolInvocation, operationId) =>
      toolPermissionRuntime.trackPendingToolPermission(toolInvocation, operationId)
  })
  const runtime = new SessionOperationRuntime({
    agentEventApplier,
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (nextOperation) => {
        operations.set(nextOperation.id, nextOperation)

        return nextOperation
      }
    },
    agentRuntime,
    attachmentsDirectory: input.attachmentsDirectory ?? '/tmp/moon-attachments',
    messagesRepository: {
      listByOperation: async (operationId) =>
        [...messages.values()].filter((message) => message.operationId === operationId),
      listByThread: async (threadId) =>
        [...messages.values()].filter((message) => message.threadId === threadId),
      save: async (message) => {
        messages.set(message.id, message)

        return message
      }
    },
    sessionsRepository: {
      list: async () => [...sessions.values()],
      findById: async (id) => sessions.get(id) ?? null,
      save: async (session) => {
        sessions.set(session.id, session)

        return session
      },
      deleteById: async (id) => {
        sessions.delete(id)
      }
    },
    toolPermissionRuntime
  })

  return {
    agentRuntime,
    assistantMessage,
    backend,
    capturedConfigs,
    events,
    messages,
    onEvent: (event, hint) => {
      events.push([event, hint])
    },
    operation,
    operations,
    recordActivatedSource,
    runtime,
    scope,
    sessions,
    toolPermissionRuntime,
    tools
  }
}

/**
 * 执行 runtime，并复用测试默认的 route hint 和输入记录。
 */
function executeRuntime(
  fixture: ReturnType<typeof createRuntimeFixture>,
  abortSignal: AbortSignal = new AbortController().signal
) {
  return fixture.runtime.execute({
    abortSignal,
    assistantMessage: fixture.assistantMessage,
    connection,
    onEvent: fixture.onEvent,
    operation: fixture.operation,
    routeHint,
    scope: fixture.scope
  })
}

describe('SessionOperationRuntime', () => {
  it('completes successful event stream and emits operation-done', async () => {
    const fixture = createRuntimeFixture({
      events: [
        { type: 'text_delta', text: 'hello' },
        { type: 'complete' }
      ]
    })
    const releaseBackendSpy = vi.spyOn(fixture.toolPermissionRuntime, 'releaseBackend')
    const releaseListenerSpy = vi.spyOn(
      fixture.toolPermissionRuntime,
      'releaseOperationListener'
    )
    const releaseCallbacksSpy = vi.spyOn(fixture.agentRuntime, 'releaseSessionCallbacks')

    const result = await executeRuntime(fixture)

    expect(result.sourceActivation).toBeNull()
    expect(fixture.messages.get('assistant-message-1')).toMatchObject({
      content: 'hello',
      status: 'complete'
    })
    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'done',
      completionReason: 'done'
    })
    expect(fixture.sessions.get('session-1')?.updatedAt).not.toBe(timestamp)
    expect(fixture.events.map(([event]) => event.type)).toEqual([
      'message-delta',
      'operation-done'
    ])
    expect(fixture.capturedConfigs[0]?.messages).toEqual([
      {
        role: 'user',
        content: 'hello'
      }
    ])
    expect(releaseBackendSpy).toHaveBeenCalledWith('operation-1')
    expect(releaseListenerSpy).toHaveBeenCalledWith('operation-1')
    expect(releaseCallbacksSpy).toHaveBeenCalledWith('session-1')
    expect(fixture.backend.destroy).toHaveBeenCalledOnce()
  })

  it('passes stored current-turn attachments to the backend with provider-ready content', async () => {
    const attachmentsDirectory = await mkdtemp(join(tmpdir(), 'moon-operation-attachments-'))
    const textId = 'text-attachment'
    const imageId = 'image-attachment'
    const pdfId = 'pdf-attachment'
    const imageData = Buffer.from([1, 2, 3, 4])
    const pdfData = Buffer.from('pdf bytes')

    await Promise.all([
      writeFile(join(attachmentsDirectory, textId), 'hello attachment'),
      writeFile(join(attachmentsDirectory, imageId), imageData),
      writeFile(join(attachmentsDirectory, pdfId), pdfData)
    ])

    const chatInputs: Array<{ message: string; attachments?: MessageAttachment[] }> = []
    const backend = createBackend([])

    backend.chat = async function* (message, attachments) {
      chatInputs.push({ message, attachments })
      yield { type: 'text_delta', text: 'attachments received' }
    }

    const fixture = createRuntimeFixture({
      attachmentsDirectory,
      backend,
      userMessage: createMessage('user', {
        content: 'inspect these files',
        attachments: [
          {
            id: textId,
            name: 'note.txt',
            mimeType: 'text/plain',
            size: 16,
            kind: 'file',
            createdAt: timestamp
          },
          {
            id: imageId,
            name: 'diagram.png',
            mimeType: 'image/png',
            size: imageData.byteLength,
            kind: 'image',
            createdAt: timestamp
          },
          {
            id: pdfId,
            name: 'spec.pdf',
            mimeType: 'application/pdf',
            size: pdfData.byteLength,
            kind: 'file',
            createdAt: timestamp
          }
        ]
      })
    })

    await executeRuntime(fixture)

    expect(chatInputs).toHaveLength(1)
    expect(chatInputs[0]?.message).toContain(
      'inspect these files\n\n[Attachment: note.txt]\nhello attachment'
    )
    expect(chatInputs[0]?.message).toContain(
      `[Attachment: diagram.png]\n[Stored at: ${join(attachmentsDirectory, imageId)}]`
    )
    expect(chatInputs[0]?.message).toContain(
      `[Attachment: spec.pdf]\n[Stored at: ${join(attachmentsDirectory, pdfId)}]`
    )
    expect(chatInputs[0]?.attachments).toEqual([
      {
        id: textId,
        type: 'text',
        name: 'note.txt',
        mimeType: 'text/plain',
        size: 16,
        path: join(attachmentsDirectory, textId)
      },
      {
        id: imageId,
        type: 'image',
        name: 'diagram.png',
        mimeType: 'image/png',
        size: imageData.byteLength,
        path: join(attachmentsDirectory, imageId),
        base64: imageData.toString('base64')
      },
      {
        id: pdfId,
        type: 'pdf',
        name: 'spec.pdf',
        mimeType: 'application/pdf',
        size: pdfData.byteLength,
        path: join(attachmentsDirectory, pdfId),
        base64: pdfData.toString('base64')
      }
    ])
    expect(fixture.capturedConfigs[0]?.messages.at(-1)?.content).toBe(chatInputs[0]?.message)
  })

  it('marks operation and assistant as error when backend emits error', async () => {
    const closeEventStream = vi.fn()
    const backend = createBackend([])

    backend.chat = async function* () {
      try {
        yield { type: 'error', message: 'model down' }
      } finally {
        closeEventStream()
      }
    }

    const fixture = createRuntimeFixture({
      backend
    })
    const releaseBackendSpy = vi.spyOn(fixture.toolPermissionRuntime, 'releaseBackend')
    const releaseCallbacksSpy = vi.spyOn(fixture.agentRuntime, 'releaseSessionCallbacks')

    await expect(executeRuntime(fixture)).rejects.toThrow('model down')

    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'error',
      completionReason: 'error',
      error: { message: 'model down' }
    })
    expect(fixture.messages.get('assistant-message-1')).toMatchObject({
      status: 'error',
      error: 'model down'
    })
    expect(fixture.events.at(-1)?.[0]).toMatchObject({
      type: 'operation-error',
      error: 'model down'
    })
    expect(releaseBackendSpy).toHaveBeenCalledWith('operation-1')
    expect(releaseCallbacksSpy).toHaveBeenCalledWith('session-1')
    expect(closeEventStream).toHaveBeenCalledOnce()
    expect(fixture.backend.destroy).toHaveBeenCalledOnce()
  })

  it('marks aborted operation as interrupted and assistant as cancelled', async () => {
    const abortController = new AbortController()
    const fixture = createRuntimeFixture({
      throwError: new Error('sdk aborted')
    })
    abortController.abort('cancelled')

    await expect(executeRuntime(fixture, abortController.signal)).rejects.toThrow('sdk aborted')

    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'interrupted',
      completionReason: 'interrupted',
      error: null
    })
    expect(fixture.messages.get('assistant-message-1')).toMatchObject({
      status: 'cancelled',
      error: 'Cancelled by user.'
    })
    expect(fixture.events.at(-1)?.[0]).toMatchObject({
      type: 'operation-error',
      error: 'Cancelled by user.'
    })
    expect(fixture.backend.destroy).toHaveBeenCalledOnce()
  })

  it('keeps empty response guard when no source activation happened', async () => {
    const fixture = createRuntimeFixture()

    await expect(executeRuntime(fixture)).rejects.toThrow('Model returned an empty response.')

    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'error',
      completionReason: 'error',
      error: { message: 'Model returned an empty response.' }
    })
    expect(fixture.messages.get('assistant-message-1')).toMatchObject({
      status: 'error',
      error: 'Model returned an empty response.'
    })
  })

  it('allows empty response when source activation signal is emitted', async () => {
    const fixture = createRuntimeFixture({
      events: [
        {
          type: 'source_activated',
          sourceSlug: 'linear',
          originalMessage: 'create issue',
          turnId: 'turn-source'
        }
      ]
    })

    const result = await executeRuntime(fixture)

    expect(result.sourceActivation).toEqual({
      sourceSlug: 'linear',
      originalMessage: 'create issue'
    })
    expect(fixture.recordActivatedSource).toHaveBeenCalledWith('thread-1', 'linear')
    expect(fixture.messages.get('assistant-message-1')).toMatchObject({
      content: '',
      status: 'complete'
    })
    expect(fixture.operations.get('operation-1')).toMatchObject({
      status: 'done',
      completionReason: 'done'
    })
    expect(fixture.events.map(([event]) => event.type)).toEqual([
      'source-activated',
      'operation-done'
    ])
  })
})
