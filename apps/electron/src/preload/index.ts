/**
 * 负责把受限的 typed IPC bridge 暴露到 renderer。
 * 该文件只做 channel 转发和事件订阅清理，不包含主进程业务实现。
 */

import { contextBridge, ipcRenderer } from 'electron'

import type { MoonApi } from '@ipc/contracts'
import {
  workspaceWebSocketTransportInfoChannel,
  type WorkspaceWebSocketTransportInfo
} from '@ipc/workspace-transport-contract'
import { buildClientApi } from './build-client-api'
import { MOON_API_CHANNEL_MAP } from './channel-map'
import { registerPreloadClientCapabilities } from './client-capabilities'
import { createEnvelopeIpcRpcClient } from './envelope-ipc-rpc-client'
import { RoutedClient } from './routed-client'
import { createWorkspaceWebSocketRpcClient } from './websocket-rpc-client'

const localClient = createEnvelopeIpcRpcClient(ipcRenderer)
const workspaceClient = createWorkspaceWebSocketRpcClient({
  getTransportInfo: () =>
    localClient.invoke(
      workspaceWebSocketTransportInfoChannel
    ) as Promise<WorkspaceWebSocketTransportInfo>
})
const routedClient = new RoutedClient(localClient, workspaceClient)

registerPreloadClientCapabilities(routedClient, localClient)

const api: MoonApi = buildClientApi(routedClient, MOON_API_CHANNEL_MAP)

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  const windowWithBridge = window as unknown as Window & {
    api: MoonApi
  }

  windowWithBridge.api = api
}
