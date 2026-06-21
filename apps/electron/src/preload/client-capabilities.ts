/**
 * 注册 preload 可承载的 workspace client capabilities。
 * 本文件只做远程 capability 到本地安全 RPC 的桥接，不向 renderer 暴露新 API。
 */

import {
  CLIENT_CAPABILITY_DEFINITIONS,
  CLIENT_OPEN_EXTERNAL,
  type ClientCapabilityChannel,
  type RpcClientCapabilityPort,
  type RpcClientPort
} from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'

const PRELOAD_CLIENT_CAPABILITY_ALLOWLIST = [
  CLIENT_OPEN_EXTERNAL
] as const satisfies readonly ClientCapabilityChannel[]

type PreloadClientCapabilityChannel = (typeof PRELOAD_CLIENT_CAPABILITY_ALLOWLIST)[number]

/**
 * preload 产品运行时允许注册的 client capability 列表。
 */
export function getPreloadClientCapabilityAllowlist(): readonly PreloadClientCapabilityChannel[] {
  return PRELOAD_CLIENT_CAPABILITY_ALLOWLIST
}

/**
 * 注册当前 preload host 允许 workspace server 反向调用的安全能力。
 */
export function registerPreloadClientCapabilities(
  capabilityClient: RpcClientCapabilityPort,
  localClient: Pick<RpcClientPort, 'invoke'>
): void {
  for (const channel of PRELOAD_CLIENT_CAPABILITY_ALLOWLIST) {
    assertProductCapability(channel)
    capabilityClient.handleCapability(
      channel,
      createPreloadClientCapabilityHandler(channel, localClient)
    )
  }
}

/**
 * 根据 allowlist channel 创建对应 handler；新增能力必须显式进入该分发。
 */
function createPreloadClientCapabilityHandler(
  channel: PreloadClientCapabilityChannel,
  localClient: Pick<RpcClientPort, 'invoke'>
): (...args: unknown[]) => Promise<void> {
  if (channel === CLIENT_OPEN_EXTERNAL) {
    return (url) => handleOpenExternalCapability(localClient, url)
  }

  return assertNeverCapability(channel)
}

/**
 * 处理远程 server 请求打开外链的 capability，并转交给 main 侧最终安全校验。
 */
async function handleOpenExternalCapability(
  localClient: Pick<RpcClientPort, 'invoke'>,
  url: unknown
): Promise<void> {
  if (typeof url !== 'string') {
    throw new Error('client:openExternal requires a URL string')
  }

  await localClient.invoke(RPC_CHANNELS.window.openExternal, { url })
}

/**
 * 防止 test-only capability 被误加入产品 preload allowlist。
 */
function assertProductCapability(channel: PreloadClientCapabilityChannel): void {
  const definition = CLIENT_CAPABILITY_DEFINITIONS[channel]

  if (definition.availability !== 'product') {
    throw new Error(`Client capability is not available in preload runtime: ${channel}`)
  }
}

/**
 * 在 allowlist 扩展但未实现 handler 时让 typecheck 和运行时都明确失败。
 */
function assertNeverCapability(channel: never): never {
  throw new Error(`Unsupported preload client capability: ${channel}`)
}
