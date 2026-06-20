/**
 * 负责把 Electron main 内部 shared RPC event channel 映射回当前 legacy IPC event。
 * 本文件只处理本地窗口事件分发、临时 client 定向和本地 workspace 定向，不引入 WebSocket。
 */

import type { WebContents } from 'electron'

import { ipcChannels } from '@ipc/channels'
import {
  RPC_CHANNELS,
  type BroadcastEventArgs,
  type BroadcastEventChannel,
  type PushTarget
} from '@moon/shared/protocol'
import {
  findLegacyWebContentsClient,
  listLegacyWebContentsClientsByWorkspace,
  listLegacyWebContentsClients
} from './legacy-webcontents-client-registry'

/**
 * Electron legacy IPC event bridge 当前支持的本地发送目标。
 */
export type LegacyRpcEventTarget =
  | PushTarget
  | { to: 'webContents'; sender: Pick<WebContents, 'send'> }

const legacyIpcEventChannelByRpcChannel: Record<BroadcastEventChannel, string> = {
  [RPC_CHANNELS.sessions.event]: ipcChannels.chat.sessionEvent,
  [RPC_CHANNELS.settings.onChange]: ipcChannels.settings.onChange,
  [RPC_CHANNELS.projects.onChange]: ipcChannels.projects.onChange,
  [RPC_CHANNELS.window.onStateChange]: ipcChannels.window.onStateChange
}

/**
 * 通过 shared RPC event channel 发送本地 legacy IPC 事件，保持 renderer 订阅方式不变。
 */
export function emitLegacyRpcEvent<TChannel extends BroadcastEventChannel>(
  channel: TChannel,
  target: LegacyRpcEventTarget,
  ...args: BroadcastEventArgs<TChannel>
): void {
  const legacyChannel = resolveLegacyIpcEventChannel(channel)

  if (target.to === 'all') {
    sendToAllWindows(legacyChannel, target.exclude, args)
    return
  }

  if (target.to === 'client') {
    sendToClientWindow(legacyChannel, target.clientId, args)
    return
  }

  if (target.to === 'workspace') {
    sendToWorkspaceWindows(legacyChannel, target.workspaceId, target.exclude, args)
    return
  }

  target.sender.send(legacyChannel, ...args)
}

/**
 * 向所有窗口发送 legacy IPC 事件，可按 WebContents id 字符串排除某个 client。
 */
function sendToAllWindows(legacyChannel: string, exclude: string | undefined, args: unknown[]): void {
  listLegacyWebContentsClients().forEach((client) => {
    if (exclude !== undefined && client.clientId === exclude) {
      return
    }

    client.webContents.send(legacyChannel, ...args)
  })
}

/**
 * 按临时 clientId 语义把事件发送给匹配 WebContents id 的窗口。
 */
function sendToClientWindow(legacyChannel: string, clientId: string, args: unknown[]): void {
  const client = findLegacyWebContentsClient(clientId)

  client?.webContents.send(legacyChannel, ...args)
}

/**
 * 向绑定到指定 workspace 的本地窗口发送 legacy IPC 事件。
 */
function sendToWorkspaceWindows(
  legacyChannel: string,
  workspaceId: string,
  exclude: string | undefined,
  args: unknown[]
): void {
  listLegacyWebContentsClientsByWorkspace(workspaceId).forEach((client) => {
    if (exclude !== undefined && client.clientId === exclude) {
      return
    }

    client.webContents.send(legacyChannel, ...args)
  })
}

/**
 * 将 shared RPC event channel 解析为当前 Electron legacy IPC event channel。
 */
function resolveLegacyIpcEventChannel(channel: string): string {
  const legacyChannel = legacyIpcEventChannelByRpcChannel[channel as BroadcastEventChannel]

  if (legacyChannel === undefined) {
    throw new Error(`Unsupported legacy RPC event channel: ${channel}`)
  }

  return legacyChannel
}
