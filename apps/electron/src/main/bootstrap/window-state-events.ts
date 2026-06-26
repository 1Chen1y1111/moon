/**
 * 负责把 BrowserWindow 原生窗口状态变化发布给 renderer。
 * 本文件只监听窗口事件，并通过 Craft 风格 WS RPC event 发送到当前窗口。
 */

import type { BrowserWindow } from 'electron'

import { RPC_CHANNELS } from '@moon/shared/protocol'
import type { RpcPushPort } from '@moon/server-core/transport'

type WindowStateEventSink = Pick<RpcPushPort, 'push'> & {
  findClientByWebContentsId: (webContentsId: number) => string | null
}

let eventSink: WindowStateEventSink | null = null

/**
 * 设置窗口状态事件使用的 WS RPC event sink。
 */
export function setWindowStateEventSink(nextEventSink: WindowStateEventSink | null): void {
  eventSink = nextEventSink
}

/**
 * 注册窗口最大化相关状态事件，并把状态变化发送给当前窗口的 renderer。
 */
export function registerWindowStateEvents(window: BrowserWindow): void {
  const publishWindowState = (): void => {
    const clientId = eventSink?.findClientByWebContentsId(window.webContents.id)

    if (clientId === undefined || clientId === null) {
      return
    }

    eventSink?.push(
      RPC_CHANNELS.window.onStateChange,
      { to: 'client', clientId },
      {
        isMaximized: window.isMaximized()
      }
    )
  }

  window.on('maximize', publishWindowState)
  window.on('unmaximize', publishWindowState)
  window.on('restore', publishWindowState)
}
