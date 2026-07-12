/**
 * 定义 preload MoonApi 方法到 shared RPC channel 的映射。
 * 本文件只描述 renderer 可见 API 名称，不直接决定请求走本机还是远程 transport。
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
  'sessions.listSessions': invoke(RPC_CHANNELS.sessions.listSessions),
  'sessions.getMessages': invoke(RPC_CHANNELS.sessions.getMessages),
  'sessions.listTopics': invoke(RPC_CHANNELS.sessions.listTopics),
  'sessions.listThreads': invoke(RPC_CHANNELS.sessions.listThreads),
  'sessions.activateThread': invoke(RPC_CHANNELS.sessions.activateThread),
  'sessions.createSession': invoke(RPC_CHANNELS.sessions.createSession),
  'sessions.deleteSession': invoke(RPC_CHANNELS.sessions.deleteSession),
  'sessions.importAttachment': invoke(RPC_CHANNELS.sessions.importAttachment),
  'sessions.createMessageTurn': invoke(RPC_CHANNELS.sessions.createMessageTurn),
  'sessions.runOperation': invoke(RPC_CHANNELS.sessions.runOperation),
  'sessions.sendMessage': invoke(RPC_CHANNELS.sessions.sendMessage),
  'sessions.cancelOperation': invoke(RPC_CHANNELS.sessions.cancelOperation),
  'sessions.approveToolCall': invoke(RPC_CHANNELS.sessions.approveToolCall),
  'sessions.rejectToolCall': invoke(RPC_CHANNELS.sessions.rejectToolCall),
  'sessions.onSessionEvent': listener(RPC_CHANNELS.sessions.event),

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
