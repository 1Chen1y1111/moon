/**
 * 负责为 renderer 单元测试安装 typed window.api mock。
 * 它只提供跨进程桥的测试替身，不触发真实 Electron IPC。
 */

import { vi } from 'vitest'

import type { MoonApi } from '@ipc/contracts'
import type { OpenSettingsInput, WindowState } from '@ipc/window-contracts'
import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
  ChatOperationEvent,
  CreateMessageTurnResult,
  MessageRecord,
  RunChatOperationResult,
  SendMessageEvent,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type {
  ApproveToolCallInput,
  CancelAgentOperationInput,
  CreateMessageTurnInput,
  DeleteChatSessionInput,
  GetChatMessagesInput,
  ImportChatAttachmentInput,
  ListChatThreadsInput,
  ListChatTopicsInput,
  RejectToolCallInput,
  RunChatOperationInput,
  SendChatMessageInput
} from '@moon/shared/domain/chat-validation'
import type { ProjectRecord, ProjectsChangeEvent } from '@moon/shared/domain/project'
import type { SetActiveProjectInput } from '@moon/shared/domain/project-validation'
import {
  createDefaultAppSettings,
  type AppSettings,
  type ProviderTestResult
} from '@moon/shared/domain/settings'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@moon/shared/domain/settings-validation'

type MockFn<T extends (...args: never[]) => unknown> = ReturnType<typeof vi.fn<T>>

export type MockMoonApi = {
  chat: {
    listSessions: MockFn<() => Promise<SessionRecord[]>>
    getMessages: MockFn<(input: GetChatMessagesInput) => Promise<MessageRecord[]>>
    listTopics: MockFn<(input: ListChatTopicsInput) => Promise<TopicRecord[]>>
    listThreads: MockFn<(input: ListChatThreadsInput) => Promise<ThreadRecord[]>>
    createSession: MockFn<() => Promise<SessionRecord>>
    deleteSession: MockFn<(input: DeleteChatSessionInput) => Promise<void>>
    importAttachment: MockFn<(input: ImportChatAttachmentInput) => Promise<ChatAttachmentRecord>>
    createMessageTurn: MockFn<(input: CreateMessageTurnInput) => Promise<CreateMessageTurnResult>>
    runOperation: MockFn<(input: RunChatOperationInput) => Promise<RunChatOperationResult>>
    sendMessage: MockFn<(input: SendChatMessageInput) => Promise<SendMessageResult>>
    cancelOperation: MockFn<(input: CancelAgentOperationInput) => Promise<AgentOperationRecord>>
    approveToolCall: MockFn<(input: ApproveToolCallInput) => Promise<ToolInvocationRecord>>
    rejectToolCall: MockFn<(input: RejectToolCallInput) => Promise<ToolInvocationRecord>>
    onOperationEvent: MockFn<(listener: (event: ChatOperationEvent) => void) => () => void>
    onSendMessageEvent: MockFn<(listener: (event: SendMessageEvent) => void) => () => void>
  }
  settings: {
    get: MockFn<() => Promise<AppSettings>>
    createCustomProvider: MockFn<(input: CreateCustomProviderInput) => Promise<AppSettings>>
    createCustomAcpProvider: MockFn<(input: CreateCustomAcpProviderInput) => Promise<AppSettings>>
    saveAppearance: MockFn<(input: SaveAppearanceInput) => Promise<AppSettings>>
    saveProvider: MockFn<(input: SaveProviderInput) => Promise<AppSettings>>
    deleteProvider: MockFn<(input: DeleteProviderInput) => Promise<AppSettings>>
    fetchProviderModels: MockFn<(input: ProviderConnectionInput) => Promise<AppSettings>>
    testProvider: MockFn<(input: ProviderConnectionInput) => Promise<ProviderTestResult>>
    onChange: MockFn<(listener: (settings: AppSettings) => void) => () => void>
  }
  projects: {
    list: MockFn<() => Promise<ProjectRecord[]>>
    getActive: MockFn<() => Promise<ProjectRecord | null>>
    useExistingFolder: MockFn<() => Promise<ProjectRecord | null>>
    setActive: MockFn<(input: SetActiveProjectInput) => Promise<ProjectRecord | null>>
    onChange: MockFn<(listener: (event: ProjectsChangeEvent) => void) => () => void>
  }
  windowControls: {
    close: MockFn<() => Promise<void>>
    minimize: MockFn<() => Promise<void>>
    toggleMaximize: MockFn<() => Promise<void>>
    openSettings: MockFn<(input?: OpenSettingsInput) => Promise<void>>
    getState: MockFn<() => Promise<WindowState>>
    onStateChange: MockFn<(listener: (state: WindowState) => void) => () => void>
  }
}

type MockWindowApiOptions = {
  appSettings?: AppSettings
  chatMessages?: MessageRecord[]
  chatSessions?: SessionRecord[]
  chatThreads?: ThreadRecord[]
  chatTopics?: TopicRecord[]
  createdChatSession?: SessionRecord
  activeProject?: ProjectRecord | null
  projects?: ProjectRecord[]
  sentChatMessage?: SendMessageResult
  savedSettings?: AppSettings
  windowState?: WindowState
}

function createMockWindowApi(options: MockWindowApiOptions = {}): MockMoonApi {
  const appSettings = options.appSettings ?? createDefaultAppSettings()
  const projects = options.projects ?? []
  const activeProject =
    options.activeProject === undefined ? (projects[0] ?? null) : options.activeProject
  const savedSettings = options.savedSettings ?? appSettings
  const windowState = options.windowState ?? { isMaximized: false }
  const chatSessions = options.chatSessions ?? []
  const chatTopics =
    options.chatTopics ??
    (chatSessions.length === 0
      ? []
      : [
          {
            id: 'topic-1',
            sessionId: chatSessions[0].id,
            title: '默认话题',
            createdAt: '2026-05-09T00:00:00.000Z',
            updatedAt: '2026-05-09T00:00:00.000Z'
          } satisfies TopicRecord
        ])
  const chatThreads =
    options.chatThreads ??
    (chatTopics.length === 0
      ? []
      : [
          {
            id: 'thread-1',
            sessionId: chatTopics[0].sessionId,
            topicId: chatTopics[0].id,
            title: '主线',
            status: 'active',
            createdAt: '2026-05-09T00:00:00.000Z',
            updatedAt: '2026-05-09T00:00:00.000Z'
          } satisfies ThreadRecord
        ])
  const chatMessages = options.chatMessages ?? []
  const createdChatSession =
    options.createdChatSession ??
    ({
      id: 'session-1',
      projectId: null,
      provider: 'openai',
      title: '新聊天',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    } satisfies SessionRecord)
  const sentChatMessageInput = options.sentChatMessage as Partial<SendMessageResult> | undefined
  const resultSession = sentChatMessageInput?.session ?? createdChatSession
  const resultTopic =
    sentChatMessageInput?.topic ??
    chatTopics[0] ??
    ({
      id: 'topic-1',
      sessionId: resultSession.id,
      title: '默认话题',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    } satisfies TopicRecord)
  const resultThread =
    sentChatMessageInput?.thread ??
    chatThreads[0] ??
    ({
      id: 'thread-1',
      topicId: resultTopic.id,
      title: '主线',
      type: 'standalone',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    } satisfies ThreadRecord)
  const sentChatMessage = {
    session: resultSession,
    topic: resultTopic,
    thread: resultThread,
    operation: sentChatMessageInput?.operation ?? {
      id: 'operation-1',
      appContext: { sessionId: resultSession.id },
      topicId: resultTopic.id,
      threadId: resultThread.id,
      status: 'done',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:01.000Z',
      completedAt: '2026-05-09T00:00:01.000Z'
    },
    messages: sentChatMessageInput?.messages ?? chatMessages
  } satisfies SendMessageResult
  const resultUserMessage = sentChatMessage.messages.find((message) => message.role === 'user')
  const resultAssistantMessage = sentChatMessage.messages.find(
    (message) => message.role === 'assistant'
  )
  const createMessageTurnResult = (input: CreateMessageTurnInput): CreateMessageTurnResult => {
    const timestamp = '2026-05-09T00:00:00.000Z'
    const createdOperation = {
      ...sentChatMessage.operation,
      status: 'idle',
      completionReason: null,
      completedAt: null,
      updatedAt: timestamp
    } satisfies AgentOperationRecord
    const userMessage =
      resultUserMessage ??
      ({
        id: 'message-1',
        sessionId: resultSession.id,
        topicId: resultTopic.id,
        threadId: resultThread.id,
        operationId: createdOperation.id,
        role: 'user',
        content: input.content.trim(),
        status: 'complete',
        ...(input.attachments === undefined || input.attachments.length === 0
          ? {}
          : { attachments: input.attachments }),
        createdAt: timestamp,
        updatedAt: timestamp
      } satisfies MessageRecord)
    const assistantMessage =
      resultAssistantMessage === undefined
        ? ({
            id: 'message-2',
            sessionId: resultSession.id,
            topicId: resultTopic.id,
            threadId: resultThread.id,
            parentId: userMessage.id,
            operationId: createdOperation.id,
            role: 'assistant',
            content: '',
            reasoning: '',
            status: 'pending',
            createdAt: timestamp,
            updatedAt: timestamp
          } satisfies MessageRecord)
        : ({
            ...resultAssistantMessage,
            content: '',
            reasoning: resultAssistantMessage.reasoning ?? '',
            status: 'pending',
            error: null
          } satisfies MessageRecord)

    return {
      session: resultSession,
      topic: resultTopic,
      thread: resultThread,
      operation: createdOperation,
      userMessage,
      assistantMessage
    }
  }

  return {
    chat: {
      listSessions: vi.fn<() => Promise<SessionRecord[]>>().mockResolvedValue(chatSessions),
      getMessages: vi
        .fn<(input: GetChatMessagesInput) => Promise<MessageRecord[]>>()
        .mockResolvedValue(chatMessages),
      listTopics: vi
        .fn<(input: ListChatTopicsInput) => Promise<TopicRecord[]>>()
        .mockResolvedValue(chatTopics),
      listThreads: vi
        .fn<(input: ListChatThreadsInput) => Promise<ThreadRecord[]>>()
        .mockResolvedValue(chatThreads),
      createSession: vi.fn<() => Promise<SessionRecord>>().mockResolvedValue(createdChatSession),
      deleteSession: vi.fn<(input: DeleteChatSessionInput) => Promise<void>>().mockResolvedValue(),
      importAttachment: vi
        .fn<(input: ImportChatAttachmentInput) => Promise<ChatAttachmentRecord>>()
        .mockImplementation(async (input) => ({
          id: 'attachment-1',
          name: input.name,
          mimeType: input.mimeType,
          size: input.size,
          kind: input.mimeType.startsWith('image/') ? 'image' : 'file',
          createdAt: '2026-05-09T00:00:00.000Z'
        })),
      createMessageTurn: vi
        .fn<(input: CreateMessageTurnInput) => Promise<CreateMessageTurnResult>>()
        .mockImplementation(async (input) => createMessageTurnResult(input)),
      runOperation: vi
        .fn<(input: RunChatOperationInput) => Promise<RunChatOperationResult>>()
        .mockResolvedValue({
          operation: sentChatMessage.operation,
          messages: sentChatMessage.messages
        }),
      sendMessage: vi
        .fn<(input: SendChatMessageInput) => Promise<SendMessageResult>>()
        .mockResolvedValue(sentChatMessage),
      cancelOperation: vi
        .fn<(input: CancelAgentOperationInput) => Promise<AgentOperationRecord>>()
        .mockResolvedValue(sentChatMessage.operation),
      approveToolCall: vi
        .fn<(input: ApproveToolCallInput) => Promise<ToolInvocationRecord>>()
        .mockImplementation(async (input) => ({
          id: input.toolInvocationId,
          operationId: 'operation-1',
          messageId: 'message-2',
          name: 'mock-tool',
          arguments: {},
          result: { approved: true },
          status: 'done',
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:00:01.000Z'
        })),
      rejectToolCall: vi
        .fn<(input: RejectToolCallInput) => Promise<ToolInvocationRecord>>()
        .mockImplementation(async (input) => ({
          id: input.toolInvocationId,
          operationId: 'operation-1',
          messageId: 'message-2',
          name: 'mock-tool',
          arguments: {},
          error: input.reason ?? 'Rejected by user.',
          status: 'rejected',
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:00:01.000Z'
        })),
      onOperationEvent: vi
        .fn<(listener: (event: ChatOperationEvent) => void) => () => void>()
        .mockReturnValue(() => undefined),
      onSendMessageEvent: vi
        .fn<(listener: (event: SendMessageEvent) => void) => () => void>()
        .mockReturnValue(() => undefined)
    },
    settings: {
      get: vi.fn<() => Promise<AppSettings>>().mockResolvedValue(appSettings),
      createCustomProvider: vi
        .fn<(input: CreateCustomProviderInput) => Promise<AppSettings>>()
        .mockResolvedValue(savedSettings),
      createCustomAcpProvider: vi
        .fn<(input: CreateCustomAcpProviderInput) => Promise<AppSettings>>()
        .mockResolvedValue(savedSettings),
      saveAppearance: vi
        .fn<(input: SaveAppearanceInput) => Promise<AppSettings>>()
        .mockResolvedValue(savedSettings),
      saveProvider: vi
        .fn<(input: SaveProviderInput) => Promise<AppSettings>>()
        .mockResolvedValue(savedSettings),
      deleteProvider: vi
        .fn<(input: DeleteProviderInput) => Promise<AppSettings>>()
        .mockResolvedValue(savedSettings),
      fetchProviderModels: vi
        .fn<(input: ProviderConnectionInput) => Promise<AppSettings>>()
        .mockResolvedValue(savedSettings),
      testProvider: vi
        .fn<(input: ProviderConnectionInput) => Promise<ProviderTestResult>>()
        .mockResolvedValue({ success: true, message: 'Connection succeeded.' }),
      onChange: vi
        .fn<(listener: (settings: AppSettings) => void) => () => void>()
        .mockReturnValue(() => undefined)
    },
    projects: {
      list: vi.fn<() => Promise<ProjectRecord[]>>().mockResolvedValue(projects),
      getActive: vi.fn<() => Promise<ProjectRecord | null>>().mockResolvedValue(activeProject),
      useExistingFolder: vi
        .fn<() => Promise<ProjectRecord | null>>()
        .mockResolvedValue(activeProject),
      setActive: vi
        .fn<(input: SetActiveProjectInput) => Promise<ProjectRecord | null>>()
        .mockImplementation(async (input) => {
          if (input.projectId === null) {
            return null
          }

          return projects.find((project) => project.id === input.projectId) ?? activeProject
        }),
      onChange: vi
        .fn<(listener: (event: ProjectsChangeEvent) => void) => () => void>()
        .mockReturnValue(() => undefined)
    },
    windowControls: {
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      minimize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      toggleMaximize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      openSettings: vi
        .fn<(input?: OpenSettingsInput) => Promise<void>>()
        .mockResolvedValue(undefined),
      getState: vi.fn<() => Promise<WindowState>>().mockResolvedValue(windowState),
      onStateChange: vi
        .fn<(listener: (state: WindowState) => void) => () => void>()
        .mockReturnValue(() => undefined)
    }
  }
}

export function installMockWindowApi(options?: MockWindowApiOptions): MockMoonApi
export function installMockWindowApi(api: MockMoonApi): MockMoonApi
export function installMockWindowApi(input: MockWindowApiOptions | MockMoonApi = {}): MockMoonApi {
  const api = 'settings' in input ? input : createMockWindowApi(input)

  window.api = api as MoonApi

  return api
}
