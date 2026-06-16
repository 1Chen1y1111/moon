/**
 * 负责汇总 agent backend 抽象层，供 Electron main 和未来 server-core 复用。
 * provider 具体实现可以在此层注册，但不应泄露 SDK 原始事件到调用方。
 */

export * from './factory'
export * from './types'
