import { vi } from 'vitest'

import type { MoonApi } from '@ipc/contracts'
import type { OpenSettingsInput, WindowState } from '@ipc/window-contracts'
import type {
  MessageRecord,
  SendMessageEvent,
  SendMessageResult,
  SessionRecord
} from '@shared/domain/chat'
import type { GetChatMessagesInput, SendChatMessageInput } from '@shared/domain/chat-validation'
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
    createSession: MockFn<() => Promise<SessionRecord>>
    sendMessage: MockFn<(input: SendChatMessageInput) => Promise<SendMessageResult>>
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
  const sentChatMessage =
    options.sentChatMessage ??
    ({
      session: createdChatSession,
      messages: chatMessages
    } satisfies SendMessageResult)

  return {
    chat: {
      listSessions: vi.fn<() => Promise<SessionRecord[]>>().mockResolvedValue(chatSessions),
      getMessages: vi
        .fn<(input: GetChatMessagesInput) => Promise<MessageRecord[]>>()
        .mockResolvedValue(chatMessages),
      createSession: vi.fn<() => Promise<SessionRecord>>().mockResolvedValue(createdChatSession),
      sendMessage: vi
        .fn<(input: SendChatMessageInput) => Promise<SendMessageResult>>()
        .mockResolvedValue(sentChatMessage),
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
