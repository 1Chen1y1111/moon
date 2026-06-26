/**
 * 负责从 channel map 生成 preload 暴露给 renderer 的 API 对象。
 * 本文件只做 RPC client 方法绑定，不直接依赖 Electron IPC 或主进程服务。
 */

import type { MoonApi } from '@ipc/contracts'
import type { RpcClientPort } from '@moon/server-core/transport'

/**
 * channel map 中单个 API 方法的绑定描述。
 */
export type ChannelMapEntry =
  | { type: 'invoke'; channel: string }
  | { type: 'listener'; channel: string }

/**
 * preload API 方法名到 RPC channel 的映射；点号 key 会生成嵌套 namespace。
 */
export type ChannelMap = Record<string, ChannelMapEntry>

type GeneratedApiMethod = (...args: never[]) => unknown

/**
 * 构建 renderer 可见的 MoonApi，保持 API shape 由 channel map 统一描述。
 */
export function buildClientApi(client: RpcClientPort, channelMap: ChannelMap): MoonApi {
  const api: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(channelMap)) {
    setApiMethod(api, key, createApiMethod(client, entry))
  }

  return api as MoonApi
}

/**
 * 为单个 channel map entry 生成实际调用函数。
 */
function createApiMethod(client: RpcClientPort, entry: ChannelMapEntry): GeneratedApiMethod {
  if (entry.type === 'listener') {
    return (listener: (...args: unknown[]) => void) => client.on(entry.channel, listener)
  }

  return (...args: unknown[]) => client.invoke(entry.channel, ...args)
}

/**
 * 按点号 key 把方法写入嵌套 API 对象。
 */
function setApiMethod(api: Record<string, unknown>, key: string, method: GeneratedApiMethod): void {
  const path = key.split('.')
  let target = api

  for (const segment of path.slice(0, -1)) {
    const existing = target[segment]

    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      target[segment] = {}
    }

    target = target[segment] as Record<string, unknown>
  }

  target[path[path.length - 1]] = method
}
