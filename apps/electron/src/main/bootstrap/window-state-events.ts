/**
 * 负责把 BrowserWindow 原生窗口状态变化发布给 renderer。
 * 本文件只监听窗口事件，并通过 shared RPC event bridge 映射回当前 IPC 订阅。
 */

import type { BrowserWindow } from 'electron'

import { RPC_CHANNELS } from '@moon/shared/protocol'
import { emitLegacyRpcEvent } from './legacy-rpc-event-bridge'

/**
 * 注册窗口最大化相关状态事件，并把状态变化发送给当前窗口的 renderer。
 */
export function registerWindowStateEvents(window: BrowserWindow): void {
  const publishWindowState = (): void => {
    emitLegacyRpcEvent(
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
