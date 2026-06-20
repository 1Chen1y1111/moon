/**
 * 负责把 BrowserWindow 原生窗口状态变化发布给 renderer。
 * 本文件只监听窗口事件，并通过统一 envelope RPC event 发送到当前窗口。
 */

import type { BrowserWindow } from 'electron'

import { RPC_CHANNELS } from '@moon/shared/protocol'
import { emitElectronEnvelopeRpcEvent } from './electron-envelope-ipc-rpc-server'

/**
 * 注册窗口最大化相关状态事件，并把状态变化发送给当前窗口的 renderer。
 */
export function registerWindowStateEvents(window: BrowserWindow): void {
  const publishWindowState = (): void => {
    emitElectronEnvelopeRpcEvent(
      RPC_CHANNELS.window.onStateChange,
      { to: 'webContents', sender: window.webContents },
      {
        isMaximized: window.isMaximized()
      }
    )
  }

  window.on('maximize', publishWindowState)
  window.on('unmaximize', publishWindowState)
  window.on('restore', publishWindowState)
}
