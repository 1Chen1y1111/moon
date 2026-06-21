/**
 * 定义 Moon 内部 RPC 协议通道名，边界止于可复用 transport-neutral contract。
 * 这些通道不等同于当前 Electron IPC channel，Electron 适配层会在后续步骤负责映射。
 */

/**
 * Moon 内部 RPC channel 表，值作为稳定协议字符串，key 只服务于 TypeScript 调用侧。
 */
export const RPC_CHANNELS = {
  sessions: {
    listSessions: 'sessions:listSessions',
    getMessages: 'sessions:getMessages',
    listTopics: 'sessions:listTopics',
    listThreads: 'sessions:listThreads',
    createSession: 'sessions:createSession',
    deleteSession: 'sessions:deleteSession',
    importAttachment: 'sessions:importAttachment',
    createMessageTurn: 'sessions:createMessageTurn',
    runOperation: 'sessions:runOperation',
    sendMessage: 'sessions:sendMessage',
    cancelOperation: 'sessions:cancelOperation',
    approveToolCall: 'sessions:approveToolCall',
    rejectToolCall: 'sessions:rejectToolCall',
    event: 'session:event'
  },
  settings: {
    get: 'settings:get',
    createCustomProvider: 'settings:createCustomProvider',
    createCustomAcpProvider: 'settings:createCustomAcpProvider',
    saveProvider: 'settings:saveProvider',
    deleteProvider: 'settings:deleteProvider',
    fetchProviderModels: 'settings:fetchProviderModels',
    testProvider: 'settings:testProvider',
    saveAppearance: 'settings:saveAppearance',
    onChange: 'settings:onChange'
  },
  projects: {
    list: 'projects:list',
    getActive: 'projects:getActive',
    useExistingFolder: 'projects:useExistingFolder',
    delete: 'projects:delete',
    setActive: 'projects:setActive',
    onChange: 'projects:onChange'
  },
  window: {
    close: 'window:close',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggleMaximize',
    openSettings: 'window:openSettings',
    openExternal: 'window:openExternal',
    getState: 'window:getState',
    onStateChange: 'window:onStateChange'
  }
} as const

/**
 * sessions 领域当前可识别的 RPC channel，包括请求通道和事件推送通道。
 */
export type SessionRpcChannel = (typeof RPC_CHANNELS.sessions)[keyof typeof RPC_CHANNELS.sessions]

/**
 * settings 领域当前可识别的 RPC channel，包括请求通道和设置变更推送通道。
 */
export type SettingsRpcChannel = (typeof RPC_CHANNELS.settings)[keyof typeof RPC_CHANNELS.settings]

/**
 * projects 领域当前可识别的 RPC channel，包括请求通道和项目变更推送通道。
 */
export type ProjectsRpcChannel = (typeof RPC_CHANNELS.projects)[keyof typeof RPC_CHANNELS.projects]

/**
 * window 领域当前可识别的 RPC channel，包括窗口控制请求和窗口状态推送通道。
 */
export type WindowRpcChannel = (typeof RPC_CHANNELS.window)[keyof typeof RPC_CHANNELS.window]

/**
 * Moon 内部 RPC channel 联合类型，后续新增领域时从这里扩展。
 */
export type RpcChannel =
  | SessionRpcChannel
  | SettingsRpcChannel
  | ProjectsRpcChannel
  | WindowRpcChannel
