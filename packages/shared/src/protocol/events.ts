/**
 * 定义 Moon 内部 RPC 推送事件通道和 payload 的类型映射。
 * 本文件只描述 shared protocol contract，不绑定 Electron IPC 或具体推送实现。
 */

import type { ChatOperationEvent } from '../domain/chat'
import type { ProjectsChangeEvent } from '../domain/project'
import type { AppSettings } from '../domain/settings'
import { RPC_CHANNELS } from './channels'

/**
 * 窗口状态事件在 shared protocol 层的 payload，供 Electron IPC contract 复用。
 */
export type WindowState = {
  isMaximized: boolean
}

/**
 * server 到 client 的事件通道类型表，key 是 RPC event channel，value 是发送参数 tuple。
 */
export interface BroadcastEventMap {
  [RPC_CHANNELS.sessions.event]: [event: ChatOperationEvent]
  [RPC_CHANNELS.settings.onChange]: [settings: AppSettings]
  [RPC_CHANNELS.projects.onChange]: [event: ProjectsChangeEvent]
  [RPC_CHANNELS.window.onStateChange]: [state: WindowState]
}

/**
 * 当前 shared protocol 明确支持的事件推送通道。
 */
export type BroadcastEventChannel = keyof BroadcastEventMap & string

/**
 * 根据事件通道反推出该通道允许发送的参数列表。
 */
export type BroadcastEventArgs<TChannel extends BroadcastEventChannel> =
  BroadcastEventMap[TChannel]
