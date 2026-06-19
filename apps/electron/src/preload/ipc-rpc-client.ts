/**
 * 负责把 preload 内部 RPC client 端口适配到当前 Electron IPC。
 * 本文件只映射 session RPC channel 到既有 `chat:*` IPC channel，不改变 renderer API。
 */

import type { IpcRenderer } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type { RpcClientPort } from '@moon/server-core/transport'
import { RPC_CHANNELS, type SessionRpcChannel } from '@moon/shared/protocol'

/**
 * preload 中实际会调用的 Electron ipcRenderer 子集，方便单测注入 fake。
 */
type IpcRendererBridge = Pick<IpcRenderer, 'invoke' | 'on' | 'off'>

/**
 * session RPC channel 到现有 Electron chat IPC channel 的映射表。
 */
const sessionIpcChannelByRpcChannel: Record<SessionRpcChannel, string> = {
  [RPC_CHANNELS.sessions.listSessions]: ipcChannels.chat.listSessions,
  [RPC_CHANNELS.sessions.getMessages]: ipcChannels.chat.getMessages,
  [RPC_CHANNELS.sessions.listTopics]: ipcChannels.chat.listTopics,
  [RPC_CHANNELS.sessions.listThreads]: ipcChannels.chat.listThreads,
  [RPC_CHANNELS.sessions.createSession]: ipcChannels.chat.createSession,
  [RPC_CHANNELS.sessions.deleteSession]: ipcChannels.chat.deleteSession,
  [RPC_CHANNELS.sessions.importAttachment]: ipcChannels.chat.importAttachment,
  [RPC_CHANNELS.sessions.createMessageTurn]: ipcChannels.chat.createMessageTurn,
  [RPC_CHANNELS.sessions.runOperation]: ipcChannels.chat.runOperation,
  [RPC_CHANNELS.sessions.sendMessage]: ipcChannels.chat.sendMessage,
  [RPC_CHANNELS.sessions.cancelOperation]: ipcChannels.chat.cancelOperation,
  [RPC_CHANNELS.sessions.approveToolCall]: ipcChannels.chat.approveToolCall,
  [RPC_CHANNELS.sessions.rejectToolCall]: ipcChannels.chat.rejectToolCall,
  [RPC_CHANNELS.sessions.event]: ipcChannels.chat.sessionEvent
}

/**
 * 创建基于 Electron IPC 的 RPC client，作为 preload chat API 的内部 transport。
 */
export function createIpcRpcClient(ipcRenderer: IpcRendererBridge): RpcClientPort {
  return {
    invoke: (channel, ...args) => {
      const ipcChannel = resolveSessionIpcChannel(channel)

      if (args.length === 0) {
        return ipcRenderer.invoke(ipcChannel)
      }

      return ipcRenderer.invoke(ipcChannel, ...args)
    },
    on: (channel, listener) => {
      const ipcChannel = resolveSessionIpcChannel(channel)
      const handler = (_event: unknown, ...args: unknown[]): void => {
        listener(...args)
      }

      ipcRenderer.on(ipcChannel, handler)

      return () => {
        ipcRenderer.off(ipcChannel, handler)
      }
    }
  }
}

/**
 * 将 session RPC channel 解析为当前 Electron IPC channel。
 */
function resolveSessionIpcChannel(channel: string): string {
  const ipcChannel = sessionIpcChannelByRpcChannel[channel as SessionRpcChannel]

  if (ipcChannel === undefined) {
    throw new Error(`Unsupported session RPC channel: ${channel}`)
  }

  return ipcChannel
}
