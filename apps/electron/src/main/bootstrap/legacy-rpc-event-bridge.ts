/**
 * 负责把 Electron main 内部 shared RPC event channel 映射回当前 legacy IPC event。
 * 本文件只处理本地窗口事件分发，不引入 WebSocket、workspace routing 或 server push。
 */

import { BrowserWindow, type WebContents } from 'electron'

import { ipcChannels } from '@ipc/channels'
import {
  RPC_CHANNELS,
  type ProjectsRpcChannel,
  type SessionRpcChannel,
  type SettingsRpcChannel,
  type WindowRpcChannel
} from '@moon/shared/protocol'

type AppShellRpcEventChannel =
  | typeof RPC_CHANNELS.sessions.event
  | typeof RPC_CHANNELS.settings.onChange
  | typeof RPC_CHANNELS.projects.onChange
  | typeof RPC_CHANNELS.window.onStateChange

/**
 * Electron legacy IPC event bridge 当前支持的本地发送目标。
 */
export type LegacyRpcEventTarget =
  | { to: 'all' }
  | { to: 'webContents'; sender: Pick<WebContents, 'send'> }

const legacyIpcEventChannelByRpcChannel: Record<AppShellRpcEventChannel, string> = {
  [RPC_CHANNELS.sessions.event]: ipcChannels.chat.sessionEvent,
  [RPC_CHANNELS.settings.onChange]: ipcChannels.settings.onChange,
  [RPC_CHANNELS.projects.onChange]: ipcChannels.projects.onChange,
  [RPC_CHANNELS.window.onStateChange]: ipcChannels.window.onStateChange
}

/**
 * 通过 shared RPC event channel 发送本地 legacy IPC 事件，保持 renderer 订阅方式不变。
 */
export function emitLegacyRpcEvent(
  channel: SessionRpcChannel | SettingsRpcChannel | ProjectsRpcChannel | WindowRpcChannel | string,
  target: LegacyRpcEventTarget,
  ...args: unknown[]
): void {
  const legacyChannel = resolveLegacyIpcEventChannel(channel)

  if (target.to === 'all') {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(legacyChannel, ...args)
    })
    return
  }

  target.sender.send(legacyChannel, ...args)
}

/**
 * 将 shared RPC event channel 解析为当前 Electron legacy IPC event channel。
 */
function resolveLegacyIpcEventChannel(channel: string): string {
  const legacyChannel = legacyIpcEventChannelByRpcChannel[channel as AppShellRpcEventChannel]

  if (legacyChannel === undefined) {
    throw new Error(`Unsupported legacy RPC event channel: ${channel}`)
  }

  return legacyChannel
}
