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
  }
} as const

/**
 * sessions 领域当前可识别的 RPC channel，包括请求通道和事件推送通道。
 */
export type SessionRpcChannel = (typeof RPC_CHANNELS.sessions)[keyof typeof RPC_CHANNELS.sessions]

/**
 * Moon 内部 RPC channel 联合类型，后续新增领域时从这里扩展。
 */
export type RpcChannel = SessionRpcChannel
