/**
 * 定义 transport-neutral RPC client 最小接口。
 * 本文件只描述调用和事件订阅能力，不绑定 WebSocket、Electron IPC 或重连策略。
 */

/**
 * transport client 收到指定 channel 事件时调用的 listener。
 */
export type RpcClientListener = (...args: unknown[]) => void

/**
 * server-core 和 preload 可共用的最小 RPC client 端口。
 */
export type RpcClientPort = {
  /**
   * 调用指定 RPC channel，并把参数原样交给具体 transport。
   */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>

  /**
   * 订阅指定 RPC event channel，返回取消订阅函数。
   */
  on: (channel: string, listener: RpcClientListener) => () => void
}
