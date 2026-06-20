/**
 * 负责把 preload 内部 RPC client 端口适配到当前 Electron IPC。
 * 本文件把已知 shared RPC channel 映射到既有 Electron IPC channel，未映射 channel 原样透传。
 */

import type { RpcClientPort } from '@moon/server-core/transport'
import { resolveIpcChannel, type IpcRendererBridge } from './ipc-rpc-channels'

/**
 * 创建基于 Electron IPC 的 RPC client，作为 preload API 的内部 transport。
 */
export function createIpcRpcClient(ipcRenderer: IpcRendererBridge): RpcClientPort {
  return {
    invoke: (channel, ...args) => {
      const ipcChannel = resolveIpcChannel(channel)

      if (args.length === 0) {
        return ipcRenderer.invoke(ipcChannel)
      }

      return ipcRenderer.invoke(ipcChannel, ...args)
    },
    on: (channel, listener) => {
      const ipcChannel = resolveIpcChannel(channel)
      const handler = (_event: unknown, ...args: unknown[]): void => {
        listener(...args)
      }

      ipcRenderer.on(ipcChannel, handler)

      return () => {
        ipcRenderer.off(ipcChannel, handler)
      }
    }
  }
}
