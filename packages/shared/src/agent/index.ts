/**
 * 负责暴露 shared agent 层的公开入口，边界止于 provider 无关的 backend 抽象。
 * 具体 Electron IPC、会话持久化和窗口事件不从这里导出。
 */

export * from './backend'
export * from './claude-agent'
export * from './connection-adapter'
export * from './message-adapter'
export * from './provider-adapter'
export * from './runtime'
