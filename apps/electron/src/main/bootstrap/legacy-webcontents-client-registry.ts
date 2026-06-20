/**
 * 负责把当前 Electron WebContents 映射为 legacy RPC client。
 * 本文件只集中本地窗口 clientId 与 workspace 绑定语义，不实现远程连接管理。
 */

import { BrowserWindow, type WebContents } from 'electron'

/**
 * Electron legacy RPC client 的最小窗口端表示。
 */
export type LegacyWebContentsClient = {
  clientId: string
  workspaceId: string | null
  webContents: Pick<WebContents, 'id' | 'send'>
}

const workspaceIdByClientId = new Map<string, string | null>()

/**
 * 将 WebContents 映射为当前 legacy transport 使用的 clientId。
 */
export function getLegacyWebContentsClientId(webContents: Pick<WebContents, 'id'>): string {
  return String(webContents.id)
}

/**
 * 绑定或清空当前 WebContents 对应的 workspace，用于后续 workspace target 本地分发。
 */
export function bindLegacyWebContentsClientWorkspace(
  webContents: Pick<WebContents, 'id'>,
  workspaceId: string | null
): void {
  workspaceIdByClientId.set(getLegacyWebContentsClientId(webContents), workspaceId)
}

/**
 * 列出当前所有 BrowserWindow 对应的 legacy RPC client。
 */
export function listLegacyWebContentsClients(): LegacyWebContentsClient[] {
  return BrowserWindow.getAllWindows().map((window) => {
    const webContents = window.webContents
    const clientId = getLegacyWebContentsClientId(webContents)

    return {
      clientId,
      workspaceId: workspaceIdByClientId.get(clientId) ?? null,
      webContents
    }
  })
}

/**
 * 按 legacy clientId 查找当前窗口端 client。
 */
export function findLegacyWebContentsClient(
  clientId: string
): LegacyWebContentsClient | undefined {
  return listLegacyWebContentsClients().find((client) => client.clientId === clientId)
}

/**
 * 列出已绑定到指定 workspace 的当前窗口端 client。
 */
export function listLegacyWebContentsClientsByWorkspace(
  workspaceId: string
): LegacyWebContentsClient[] {
  return listLegacyWebContentsClients().filter((client) => client.workspaceId === workspaceId)
}
