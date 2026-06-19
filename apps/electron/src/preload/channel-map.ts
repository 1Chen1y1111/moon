/**
 * 定义 preload MoonApi 方法到当前 RPC/IPC channel 的映射。
 * session 领域使用 shared RPC channel，其它领域暂时使用既有 Electron IPC channel。
 */

import { ipcChannels } from '@ipc/channels'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import type { ChannelMap } from './build-client-api'

/**
 * 创建 invoke 类型的 channel map entry。
 */
function invoke(channel: string): { type: 'invoke'; channel: string } {
  return { type: 'invoke', channel }
}

/**
 * 创建 listener 类型的 channel map entry。
 */
function listener(channel: string): { type: 'listener'; channel: string } {
  return { type: 'listener', channel }
}

/**
 * renderer 可见 MoonApi 的统一 channel map。
 */
export const MOON_API_CHANNEL_MAP = {
  'chat.listSessions': invoke(RPC_CHANNELS.sessions.listSessions),
  'chat.getMessages': invoke(RPC_CHANNELS.sessions.getMessages),
  'chat.listTopics': invoke(RPC_CHANNELS.sessions.listTopics),
  'chat.listThreads': invoke(RPC_CHANNELS.sessions.listThreads),
  'chat.createSession': invoke(RPC_CHANNELS.sessions.createSession),
  'chat.deleteSession': invoke(RPC_CHANNELS.sessions.deleteSession),
  'chat.importAttachment': invoke(RPC_CHANNELS.sessions.importAttachment),
  'chat.createMessageTurn': invoke(RPC_CHANNELS.sessions.createMessageTurn),
  'chat.runOperation': invoke(RPC_CHANNELS.sessions.runOperation),
  'chat.sendMessage': invoke(RPC_CHANNELS.sessions.sendMessage),
  'chat.cancelOperation': invoke(RPC_CHANNELS.sessions.cancelOperation),
  'chat.approveToolCall': invoke(RPC_CHANNELS.sessions.approveToolCall),
  'chat.rejectToolCall': invoke(RPC_CHANNELS.sessions.rejectToolCall),
  'chat.onSessionEvent': listener(RPC_CHANNELS.sessions.event),

  'settings.get': invoke(ipcChannels.settings.get),
  'settings.createCustomProvider': invoke(ipcChannels.settings.createCustomProvider),
  'settings.createCustomAcpProvider': invoke(ipcChannels.settings.createCustomAcpProvider),
  'settings.saveProvider': invoke(ipcChannels.settings.saveProvider),
  'settings.deleteProvider': invoke(ipcChannels.settings.deleteProvider),
  'settings.fetchProviderModels': invoke(ipcChannels.settings.fetchProviderModels),
  'settings.testProvider': invoke(ipcChannels.settings.testProvider),
  'settings.saveAppearance': invoke(ipcChannels.settings.saveAppearance),
  'settings.onChange': listener(ipcChannels.settings.onChange),

  'projects.list': invoke(ipcChannels.projects.list),
  'projects.getActive': invoke(ipcChannels.projects.getActive),
  'projects.useExistingFolder': invoke(ipcChannels.projects.useExistingFolder),
  'projects.delete': invoke(ipcChannels.projects.delete),
  'projects.setActive': invoke(ipcChannels.projects.setActive),
  'projects.onChange': listener(ipcChannels.projects.onChange),

  'windowControls.close': invoke(ipcChannels.window.close),
  'windowControls.minimize': invoke(ipcChannels.window.minimize),
  'windowControls.toggleMaximize': invoke(ipcChannels.window.toggleMaximize),
  'windowControls.openSettings': invoke(ipcChannels.window.openSettings),
  'windowControls.getState': invoke(ipcChannels.window.getState),
  'windowControls.onStateChange': listener(ipcChannels.window.onStateChange)
} satisfies ChannelMap
