/**
 * 注册 preload 可承载的 workspace client capabilities。
 * 本文件只做远程 capability 到本地安全 RPC 的桥接，不向 renderer 暴露新 API。
 */

import {
  CLIENT_OPEN_EXTERNAL,
  type RpcClientCapabilityPort,
  type RpcClientPort
} from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'

/**
 * 注册当前 preload host 允许 workspace server 反向调用的安全能力。
 */
export function registerPreloadClientCapabilities(
  capabilityClient: RpcClientCapabilityPort,
  localClient: Pick<RpcClientPort, 'invoke'>
): void {
  capabilityClient.handleCapability(CLIENT_OPEN_EXTERNAL, async (url) => {
    if (typeof url !== 'string') {
      throw new Error('client:openExternal requires a URL string')
    }

    await localClient.invoke(RPC_CHANNELS.window.openExternal, { url })
  })
}
