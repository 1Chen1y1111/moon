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
} from '../shared/domain/chat'
import type {
  ApproveToolCallInput,
  CancelAgentOperationInput,
  GetChatMessagesInput,
  ImportChatAttachmentInput,
  ListChatThreadsInput,
  ListChatTopicsInput,
  RejectToolCallInput,
  SendChatMessageInput
} from '../shared/domain/chat-validation'
import type { AppSettings, ProviderTestResult } from '../shared/domain/settings'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '../shared/domain/settings-validation'
import { ipcChannels } from './channels'
import type { OpenSettingsInput, WindowState } from './window-contracts'

export type AppIpcContractMap = {
  [ipcChannels.chat.listSessions]: {
    request: undefined
    response: SessionRecord[]
  }
  [ipcChannels.chat.getMessages]: {
    request: GetChatMessagesInput
    response: MessageRecord[]
  }
  [ipcChannels.chat.listTopics]: {
    request: ListChatTopicsInput
    response: TopicRecord[]
  }
  [ipcChannels.chat.listThreads]: {
    request: ListChatThreadsInput
    response: ThreadRecord[]
  }
  [ipcChannels.chat.createSession]: {
    request: undefined
    response: SessionRecord
  }
  [ipcChannels.chat.importAttachment]: {
    request: ImportChatAttachmentInput
    response: ChatAttachmentRecord
  }
  [ipcChannels.chat.sendMessage]: {
    request: SendChatMessageInput
    response: SendMessageResult
  }
  [ipcChannels.chat.cancelOperation]: {
    request: CancelAgentOperationInput
    response: AgentOperationRecord
  }
  [ipcChannels.chat.approveToolCall]: {
    request: ApproveToolCallInput
    response: ToolInvocationRecord
  }
  [ipcChannels.chat.rejectToolCall]: {
    request: RejectToolCallInput
    response: ToolInvocationRecord
  }
  [ipcChannels.settings.get]: {
    request: undefined
    response: AppSettings
  }
  [ipcChannels.settings.createCustomProvider]: {
    request: CreateCustomProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.createCustomAcpProvider]: {
    request: CreateCustomAcpProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.saveProvider]: {
    request: SaveProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.deleteProvider]: {
    request: DeleteProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.fetchProviderModels]: {
    request: ProviderConnectionInput
    response: AppSettings
  }
  [ipcChannels.settings.testProvider]: {
    request: ProviderConnectionInput
    response: ProviderTestResult
  }
  [ipcChannels.settings.saveAppearance]: {
    request: SaveAppearanceInput
    response: AppSettings
  }
  [ipcChannels.window.close]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.minimize]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.toggleMaximize]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.openSettings]: {
    request: OpenSettingsInput
    response: void
  }
  [ipcChannels.window.getState]: {
    request: undefined
    response: WindowState
  }
}

export type MoonApi = {
  chat: {
    listSessions: () => Promise<SessionRecord[]>
    getMessages: (input: GetChatMessagesInput) => Promise<MessageRecord[]>
    listTopics: (input: ListChatTopicsInput) => Promise<TopicRecord[]>
    listThreads: (input: ListChatThreadsInput) => Promise<ThreadRecord[]>
    createSession: () => Promise<SessionRecord>
    importAttachment: (input: ImportChatAttachmentInput) => Promise<ChatAttachmentRecord>
    sendMessage: (input: SendChatMessageInput) => Promise<SendMessageResult>
    cancelOperation: (input: CancelAgentOperationInput) => Promise<AgentOperationRecord>
    approveToolCall: (input: ApproveToolCallInput) => Promise<ToolInvocationRecord>
    rejectToolCall: (input: RejectToolCallInput) => Promise<ToolInvocationRecord>
    onSendMessageEvent: (listener: (event: SendMessageEvent) => void) => () => void
  }
  settings: {
    get: () => Promise<AppSettings>
    createCustomProvider: (input: CreateCustomProviderInput) => Promise<AppSettings>
    createCustomAcpProvider: (input: CreateCustomAcpProviderInput) => Promise<AppSettings>
    saveProvider: (input: SaveProviderInput) => Promise<AppSettings>
    deleteProvider: (input: DeleteProviderInput) => Promise<AppSettings>
    fetchProviderModels: (input: ProviderConnectionInput) => Promise<AppSettings>
    testProvider: (input: ProviderConnectionInput) => Promise<ProviderTestResult>
    saveAppearance: (input: SaveAppearanceInput) => Promise<AppSettings>
    onChange: (listener: (settings: AppSettings) => void) => () => void
  }
  windowControls: {
    close: () => Promise<void>
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    openSettings: (input?: OpenSettingsInput) => Promise<void>
    getState: () => Promise<WindowState>
    onStateChange: (listener: (state: WindowState) => void) => () => void
  }
}
