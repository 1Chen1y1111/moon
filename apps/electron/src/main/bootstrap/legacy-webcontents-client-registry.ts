/**
 * 负责把当前 Electron WebContents 映射为 legacy RPC client。
 * 本文件只集中本地窗口 clientId 语义，不实现 workspace routing 或远程连接管理。
 */

import { BrowserWindow, type WebContents } from 'electron'

/**
 * Electron legacy RPC client 的最小窗口端表示。
 */
export type LegacyWebContentsClient = {
  clientId: string
  webContents: Pick<WebContents, 'id' | 'send'>
}

/**
 * 将 WebContents 映射为当前 legacy transport 使用的 clientId。
 */
export function getLegacyWebContentsClientId(webContents: Pick<WebContents, 'id'>): string {
  return String(webContents.id)
}

/**
 * 列出当前所有 BrowserWindow 对应的 legacy RPC client。
 */
export function listLegacyWebContentsClients(): LegacyWebContentsClient[] {
  return BrowserWindow.getAllWindows().map((window) => {
    const webContents = window.webContents

    return {
      clientId: getLegacyWebContentsClientId(webContents),
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
