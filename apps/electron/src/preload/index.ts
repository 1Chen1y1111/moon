/**
 * 负责把受限的 typed IPC bridge 暴露到 renderer。
 * 该文件只做 channel 转发和事件订阅清理，不包含主进程业务实现。
 */

import { contextBridge, ipcRenderer } from 'electron'

import type { MoonApi } from '@ipc/contracts'
import { buildClientApi } from './build-client-api'
import { MOON_API_CHANNEL_MAP } from './channel-map'
import { createEnvelopeIpcRpcClient } from './envelope-ipc-rpc-client'
import { createIpcRpcClient } from './ipc-rpc-client'
import { RoutedClient } from './routed-client'

const localClient = createIpcRpcClient(ipcRenderer)
const workspaceClient = createEnvelopeIpcRpcClient(ipcRenderer)
const api: MoonApi = buildClientApi(
  new RoutedClient(localClient, workspaceClient),
  MOON_API_CHANNEL_MAP
)

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
