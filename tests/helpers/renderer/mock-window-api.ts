import { vi } from 'vitest'

import type { MoonApi } from '@ipc/contracts'
import type { OpenSettingsInput, WindowState } from '@ipc/window-contracts'
import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
  MessageRecord,
  SendMessageEvent,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@shared/domain/chat'
import type {
  ApproveToolCallInput,
  CancelAgentOperationInput,
  GetChatMessagesInput,
  ImportChatAttachmentInput,
  ListChatThreadsInput,
  ListChatTopicsInput,
  RejectToolCallInput,
  SendChatMessageInput
} from '@shared/domain/chat-validation'
import {
  createDefaultAppSettings,
  type AppSettings,
  type ProviderTestResult
} from '@shared/domain/settings'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@shared/domain/settings-validation'

type MockFn<T extends (...args: never[]) => unknown> = ReturnType<typeof vi.fn<T>>

export type MockMoonApi = {
  chat: {
    listSessions: MockFn<() => Promise<SessionRecord[]>>
    getMessages: MockFn<(input: GetChatMessagesInput) => Promise<MessageRecord[]>>
    listTopics: MockFn<(input: ListChatTopicsInput) => Promise<TopicRecord[]>>
    listThreads: MockFn<(input: ListChatThreadsInput) => Promise<ThreadRecord[]>>
    createSession: MockFn<() => Promise<SessionRecord>>
    importAttachment: MockFn<(input: ImportChatAttachmentInput) => Promise<ChatAttachmentRecord>>
    sendMessage: MockFn<(input: SendChatMessageInput) => Promise<SendMessageResult>>
    cancelOperation: MockFn<(input: CancelAgentOperationInput) => Promise<AgentOperationRecord>>
    approveToolCall: MockFn<(input: ApproveToolCallInput) => Promise<ToolInvocationRecord>>
    rejectToolCall: MockFn<(input: RejectToolCallInput) => Promise<ToolInvocationRecord>>
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
  sentChatMessage?: SendMessageResult
  savedSettings?: AppSettings
  windowState?: WindowState
}

function createMockWindowApi(options: MockWindowApiOptions = {}): MockMoonApi {
  const appSettings = options.appSettings ?? createDefaultAppSettings()
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
