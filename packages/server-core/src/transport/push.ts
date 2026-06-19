/**
 * 提供 server-core 使用的类型安全事件推送 helper。
 * 本文件只约束 channel 与 payload 类型，不负责具体 transport 广播实现。
 */

import type { BroadcastEventArgs, BroadcastEventChannel, PushTarget } from '@moon/shared/protocol'

import type { RpcPushPort } from './types'

/**
 * 按 shared BroadcastEventMap 约束事件参数，并把事件原样交给底层 push transport。
 */
export function pushTyped<TChannel extends BroadcastEventChannel>(
  server: RpcPushPort,
  channel: TChannel,
  target: PushTarget,
  ...args: BroadcastEventArgs<TChannel>
): void {
  server.push(channel, target, ...args)
}
