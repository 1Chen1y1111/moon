/**
 * 维护 preload 内部 RPC channel 到现有 Electron IPC channel 的映射。
 * 本文件只处理 channel 名称解析，不负责 invoke、订阅或 envelope 编码。
 */

import type { IpcRenderer } from 'electron'

import { ipcChannels } from '@ipc/channels'
import { RPC_CHANNELS, type RpcChannel } from '@moon/shared/protocol'

/**
 * preload 中实际会调用的 Electron ipcRenderer 子集，方便单测注入 fake。
 */
export type IpcRendererBridge = Pick<IpcRenderer, 'invoke' | 'on' | 'off'>

/**
 * 内部 RPC channel 到现有 Electron IPC channel 的映射表。
 */
const ipcChannelByRpcChannel: Partial<Record<RpcChannel, string>> = {
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
  [RPC_CHANNELS.sessions.event]: ipcChannels.chat.sessionEvent,

  [RPC_CHANNELS.settings.get]: ipcChannels.settings.get,
  [RPC_CHANNELS.settings.createCustomProvider]: ipcChannels.settings.createCustomProvider,
  [RPC_CHANNELS.settings.createCustomAcpProvider]: ipcChannels.settings.createCustomAcpProvider,
  [RPC_CHANNELS.settings.saveProvider]: ipcChannels.settings.saveProvider,
  [RPC_CHANNELS.settings.deleteProvider]: ipcChannels.settings.deleteProvider,
  [RPC_CHANNELS.settings.fetchProviderModels]: ipcChannels.settings.fetchProviderModels,
  [RPC_CHANNELS.settings.testProvider]: ipcChannels.settings.testProvider,
  [RPC_CHANNELS.settings.saveAppearance]: ipcChannels.settings.saveAppearance,
  [RPC_CHANNELS.settings.onChange]: ipcChannels.settings.onChange,

  [RPC_CHANNELS.projects.list]: ipcChannels.projects.list,
  [RPC_CHANNELS.projects.getActive]: ipcChannels.projects.getActive,
  [RPC_CHANNELS.projects.useExistingFolder]: ipcChannels.projects.useExistingFolder,
  [RPC_CHANNELS.projects.delete]: ipcChannels.projects.delete,
  [RPC_CHANNELS.projects.setActive]: ipcChannels.projects.setActive,
  [RPC_CHANNELS.projects.onChange]: ipcChannels.projects.onChange,

  [RPC_CHANNELS.window.close]: ipcChannels.window.close,
  [RPC_CHANNELS.window.minimize]: ipcChannels.window.minimize,
  [RPC_CHANNELS.window.toggleMaximize]: ipcChannels.window.toggleMaximize,
  [RPC_CHANNELS.window.openSettings]: ipcChannels.window.openSettings,
  [RPC_CHANNELS.window.getState]: ipcChannels.window.getState,
  [RPC_CHANNELS.window.onStateChange]: ipcChannels.window.onStateChange
}

/**
 * 将内部 RPC channel 解析为当前 Electron IPC channel；未映射 channel 暂时原样透传。
 */
export function resolveIpcChannel(channel: string): string {
  const ipcChannel = ipcChannelByRpcChannel[channel as RpcChannel]

  return ipcChannel ?? channel
}
