/**
 * 负责定义 preload 暴露给 renderer 的 typed API 合同。
 * 类型只描述 renderer 可见能力，不直接绑定 Electron IPC 或 WS transport。
 */

import type {
  AgentOperationRecord,
  ChatOperationEvent,
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
import type {
  ActivateChatThreadInput,
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
import type { OpenSettingsInput, WindowState } from './window-contracts'

/**
 * preload 注入到 renderer 的最小 API surface，renderer 只能通过该对象跨进程通信。
 */
export type MoonApi = {
  sessions: {
    listSessions: () => Promise<SessionRecord[]>
    getMessages: (input: GetChatMessagesInput) => Promise<MessageRecord[]>
    listTopics: (input: ListChatTopicsInput) => Promise<TopicRecord[]>
    listThreads: (input: ListChatThreadsInput) => Promise<ThreadRecord[]>
    activateThread: (input: ActivateChatThreadInput) => Promise<ThreadRecord>
    createSession: () => Promise<SessionRecord>
    deleteSession: (input: DeleteChatSessionInput) => Promise<void>
    importAttachment: (input: ImportChatAttachmentInput) => Promise<ChatAttachmentRecord>
    createMessageTurn: (input: CreateMessageTurnInput) => Promise<CreateMessageTurnResult>
    runOperation: (input: RunChatOperationInput) => Promise<RunChatOperationResult>
    sendMessage: (input: SendChatMessageInput) => Promise<SendMessageResult>
    cancelOperation: (input: CancelAgentOperationInput) => Promise<AgentOperationRecord>
    approveToolCall: (input: ApproveToolCallInput) => Promise<ToolInvocationRecord>
    rejectToolCall: (input: RejectToolCallInput) => Promise<ToolInvocationRecord>
    onSessionEvent: (listener: (event: ChatOperationEvent) => void) => () => void
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
