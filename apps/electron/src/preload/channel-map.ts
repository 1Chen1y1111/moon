/**
 * 定义 preload MoonApi 方法到当前 RPC/IPC channel 的映射。
 * 所有 renderer API 都先绑定到 shared RPC channel，再由具体 transport adapter 映射到 IPC。
 */

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

  'settings.get': invoke(RPC_CHANNELS.settings.get),
  'settings.createCustomProvider': invoke(RPC_CHANNELS.settings.createCustomProvider),
  'settings.createCustomAcpProvider': invoke(RPC_CHANNELS.settings.createCustomAcpProvider),
  'settings.saveProvider': invoke(RPC_CHANNELS.settings.saveProvider),
  'settings.deleteProvider': invoke(RPC_CHANNELS.settings.deleteProvider),
  'settings.fetchProviderModels': invoke(RPC_CHANNELS.settings.fetchProviderModels),
  'settings.testProvider': invoke(RPC_CHANNELS.settings.testProvider),
  'settings.saveAppearance': invoke(RPC_CHANNELS.settings.saveAppearance),
  'settings.onChange': listener(RPC_CHANNELS.settings.onChange),

  'projects.list': invoke(RPC_CHANNELS.projects.list),
  'projects.getActive': invoke(RPC_CHANNELS.projects.getActive),
  'projects.useExistingFolder': invoke(RPC_CHANNELS.projects.useExistingFolder),
  'projects.delete': invoke(RPC_CHANNELS.projects.delete),
  'projects.setActive': invoke(RPC_CHANNELS.projects.setActive),
  'projects.onChange': listener(RPC_CHANNELS.projects.onChange),

  'windowControls.close': invoke(RPC_CHANNELS.window.close),
  'windowControls.minimize': invoke(RPC_CHANNELS.window.minimize),
  'windowControls.toggleMaximize': invoke(RPC_CHANNELS.window.toggleMaximize),
  'windowControls.openSettings': invoke(RPC_CHANNELS.window.openSettings),
  'windowControls.getState': invoke(RPC_CHANNELS.window.getState),
  'windowControls.onStateChange': listener(RPC_CHANNELS.window.onStateChange)
} satisfies ChannelMap
