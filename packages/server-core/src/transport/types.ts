/**
 * 定义 transport-neutral RPC client 和 push server 最小接口。
 * 本文件只描述调用、订阅和事件推送能力，不绑定 WebSocket、Electron IPC 或重连策略。
 */

import type { BroadcastEventArgs, BroadcastEventChannel, PushTarget } from '@moon/shared/protocol'

/**
 * transport client 收到指定 channel 事件时调用的 listener。
 */
export type RpcClientListener = (...args: unknown[]) => void

/**
 * client capability handler 由 server 反向调用，返回值会通过 response envelope 回写。
 */
export type RpcClientCapabilityHandler = (...args: unknown[]) => Promise<unknown> | unknown

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

/**
 * 支持 server 反向调用的 RPC client 扩展端口。
 */
export type RpcClientCapabilityPort = {
  /**
   * 注册当前 client 可以处理的 capability channel。
   */
  handleCapability: (channel: string, handler: RpcClientCapabilityHandler) => void
}

/**
 * server-core 推送事件所依赖的最小 transport 端口，具体广播策略由 adapter 实现。
 */
export type RpcPushPort = {
  /**
   * 推送指定事件通道，参数保持原样透传给 transport。
   */
  push(channel: string, target: PushTarget, ...args: unknown[]): void
}

/**
 * 按 shared BroadcastEventMap 约束事件通道和 payload 的 typed push 端口。
 */
export type TypedRpcPushPort = {
  /**
   * 推送 shared protocol 中声明过的事件，并按通道约束参数 tuple。
   */
  push<TChannel extends BroadcastEventChannel>(
    channel: TChannel,
    target: PushTarget,
    ...args: BroadcastEventArgs<TChannel>
  ): void
}
