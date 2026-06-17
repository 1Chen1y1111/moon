/**
 * 负责定义 preload 暴露给 renderer 的 typed IPC 合同。
 * 类型只描述跨进程 wire contract，不直接调用 Electron 或主进程服务。
 */

import type {
  AgentOperationRecord,
  ChatOperationEvent,
  ChatAttachmentRecord,
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
import type { AppSettings, ProviderTestResult } from '@moon/shared/domain/settings'
import type { ProjectRecord, ProjectsChangeEvent } from '@moon/shared/domain/project'
import type {
  DeleteProjectInput,
  SetActiveProjectInput
} from '@moon/shared/domain/project-validation'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@moon/shared/domain/settings-validation'
import { ipcChannels } from './channels'
import type { OpenSettingsInput, WindowState } from './window-contracts'

/**
 * 每个 IPC channel 的请求与响应类型映射，供 main/preload 双侧复用。
 */
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
  [ipcChannels.chat.deleteSession]: {
    request: DeleteChatSessionInput
    response: void
  }
  [ipcChannels.chat.importAttachment]: {
    request: ImportChatAttachmentInput
    response: ChatAttachmentRecord
  }
  [ipcChannels.chat.createMessageTurn]: {
    request: CreateMessageTurnInput
    response: CreateMessageTurnResult
  }
  [ipcChannels.chat.runOperation]: {
    request: RunChatOperationInput
    response: RunChatOperationResult
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
  [ipcChannels.projects.list]: {
    request: undefined
    response: ProjectRecord[]
  }
  [ipcChannels.projects.getActive]: {
    request: undefined
    response: ProjectRecord | null
  }
  [ipcChannels.projects.useExistingFolder]: {
    request: undefined
    response: ProjectRecord | null
  }
  [ipcChannels.projects.delete]: {
    request: DeleteProjectInput
    response: void
  }
  [ipcChannels.projects.setActive]: {
    request: SetActiveProjectInput
    response: ProjectRecord | null
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

/**
 * preload 注入到 renderer 的最小 API surface，renderer 只能通过该对象跨进程通信。
 */
export type MoonApi = {
  chat: {
    listSessions: () => Promise<SessionRecord[]>
    getMessages: (input: GetChatMessagesInput) => Promise<MessageRecord[]>
    listTopics: (input: ListChatTopicsInput) => Promise<TopicRecord[]>
    listThreads: (input: ListChatThreadsInput) => Promise<ThreadRecord[]>
    createSession: () => Promise<SessionRecord>
    deleteSession: (input: DeleteChatSessionInput) => Promise<void>
    importAttachment: (input: ImportChatAttachmentInput) => Promise<ChatAttachmentRecord>
    createMessageTurn: (input: CreateMessageTurnInput) => Promise<CreateMessageTurnResult>
    runOperation: (input: RunChatOperationInput) => Promise<RunChatOperationResult>
    sendMessage: (input: SendChatMessageInput) => Promise<SendMessageResult>
    cancelOperation: (input: CancelAgentOperationInput) => Promise<AgentOperationRecord>
    approveToolCall: (input: ApproveToolCallInput) => Promise<ToolInvocationRecord>
    rejectToolCall: (input: RejectToolCallInput) => Promise<ToolInvocationRecord>
    onOperationEvent: (listener: (event: ChatOperationEvent) => void) => () => void
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
  projects: {
    list: () => Promise<ProjectRecord[]>
    getActive: () => Promise<ProjectRecord | null>
    useExistingFolder: () => Promise<ProjectRecord | null>
    delete: (input: DeleteProjectInput) => Promise<void>
    setActive: (input: SetActiveProjectInput) => Promise<ProjectRecord | null>
    onChange: (listener: (event: ProjectsChangeEvent) => void) => () => void
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
