/**
 * 定义 Electron 内部 WS transport discovery contract。
 * 本文件只服务 preload 初始化，不暴露给 renderer API。
 */

/**
 * preload 查询本机 WebSocket RPC server 连接信息时使用的内部 channel。
 */
export const localWebSocketTransportInfoChannel = 'workspace:getLocalWebSocketTransportInfo'

/**
 * preload 查询当前窗口 webContents.id 时使用的内部 channel。
 */
export const webContentsIdChannel = 'window:getWebContentsId'

/**
 * main 返回给 preload 的 workspace WebSocket 连接信息。
 */
export type WorkspaceWebSocketTransportInfo = {
  authToken?: string
  mode: 'local' | 'remote'
  url: string
  workspaceId?: string
}
