/**
 * 定义 Electron 内部 workspace transport discovery contract。
 * 本文件只服务 preload-main 的 envelope IPC，不暴露给 renderer API。
 */

/**
 * preload 通过统一 rpc:request 查询 workspace WebSocket 连接信息时使用的内部 channel。
 */
export const workspaceWebSocketTransportInfoChannel = 'workspace:getWebSocketTransportInfo'

/**
 * main 返回给 preload 的 workspace WebSocket 连接信息。
 */
export type WorkspaceWebSocketTransportInfo = {
  mode: 'local' | 'remote'
  url: string
}
