/**
 * 负责按 Craft 风格创建 preload 侧 WS RPC client，并把 typed API 暴露到 renderer。
 * Electron IPC 只用于初始化发现本机 WS endpoint，不承载业务 RPC。
 */

import { contextBridge, ipcRenderer } from 'electron'

import type { MoonApi } from '@ipc/contracts'
import {
  localWebSocketTransportInfoChannel,
  webContentsIdChannel,
  type WorkspaceWebSocketTransportInfo
} from '@ipc/workspace-transport-contract'
import { buildClientApi } from './build-client-api'
import { RoutedClient } from './routed-client'
import { MOON_API_CHANNEL_MAP } from './channel-map'
import { registerPreloadClientCapabilities } from './client-capabilities'
import { createWorkspaceWebSocketRpcClient } from './websocket-rpc-client'

/**
 * 本地 RPC client 连接 Electron main 启动的内嵌 WS RPC server。
 * settings/projects/window 和本地 sessions 都通过这条 Craft 风格主通道进入 main。
 */
const localClient = createWorkspaceWebSocketRpcClient({
  getTransportInfo: () =>
    ipcRenderer.invoke(
      localWebSocketTransportInfoChannel
    ) as Promise<WorkspaceWebSocketTransportInfo>,
  getWebContentsId: () => ipcRenderer.invoke(webContentsIdChannel) as Promise<number>
})

/**
 * workspace RPC client 指向当前 workspace 所属 server；默认复用本机 localClient。
 * 配置远程 workspace 时，sessions 这类 REMOTE_ELIGIBLE channel 会路由到远程 WS。
 */
const remoteTransportInfo = readRemoteWorkspaceTransportInfo()
const workspaceClient =
  remoteTransportInfo === null
    ? localClient
    : createWorkspaceWebSocketRpcClient({
        getTransportInfo: () => Promise.resolve(remoteTransportInfo),
        getWebContentsId: () => ipcRenderer.invoke(webContentsIdChannel) as Promise<number>
      })

/**
 * 根据 shared protocol routing 在本机 WS 与 workspace WS 之间分流。
 * local-only 始终走 localClient，sessions 默认也走本机，远程配置时才切到 workspaceClient。
 */
const routedClient = new RoutedClient(localClient, workspaceClient)

/**
 * 注册 preload 自己可响应的 client capabilities，供 workspace server 需要时反向调用。
 * 当前不会把 capability 直接暴露给 renderer。
 */
registerPreloadClientCapabilities(routedClient, localClient)

localClient.connect()
if (workspaceClient !== localClient) {
  workspaceClient.connect()
}

/**
 * 按 channel map 生成 renderer 可见的 typed API；这里不手写每个方法，
 * 而是把 `sessions.createMessageTurn` 这类方法映射到稳定 RPC channel。
 */
const api: MoonApi = buildClientApi(routedClient, MOON_API_CHANNEL_MAP)

if (process.contextIsolated) {
  try {
    /**
     * context isolation 开启时只能通过 contextBridge 暴露受限 API，
     * renderer 后续访问的 `window.api` 就来自这里。
     */
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

/**
 * 读取远程 workspace 的环境变量配置，空白值视为未配置。
 */
function readRemoteWorkspaceTransportInfo(): WorkspaceWebSocketTransportInfo | null {
  const url = readOptionalEnv('MOON_WORKSPACE_WS_URL')

  if (url === undefined) {
    return null
  }

  const authToken = readOptionalEnv('MOON_WORKSPACE_WS_TOKEN')
  const workspaceId = readOptionalEnv('MOON_WORKSPACE_ID')

  return {
    ...(authToken === undefined ? {} : { authToken }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
    mode: 'remote',
    url
  }
}

/**
 * 读取 preload 运行时环境变量，并把空白字符串规整为未配置。
 */
function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()

  return value ? value : undefined
}
