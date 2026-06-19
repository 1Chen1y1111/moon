/**
 * 负责把 Electron app-shell 的 shared RPC channel 映射到当前 legacy IPC channel。
 * 本文件只处理 LOCAL_ONLY app-shell 请求通道，不注册 settings/projects/window 的事件通道。
 */

import type { IpcMainInvokeEvent } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type { RpcServerPort } from '@moon/server-core/handlers'
import {
  RPC_CHANNELS,
  type ProjectsRpcChannel,
  type SettingsRpcChannel,
  type WindowRpcChannel
} from '@moon/shared/protocol'
import { createLegacyIpcRpcServer } from './legacy-ipc-rpc-server'

type CallableSettingsRpcChannel = Exclude<
  SettingsRpcChannel,
  typeof RPC_CHANNELS.settings.onChange
>
type CallableProjectsRpcChannel = Exclude<
  ProjectsRpcChannel,
  typeof RPC_CHANNELS.projects.onChange
>
type CallableWindowRpcChannel = Exclude<
  WindowRpcChannel,
  typeof RPC_CHANNELS.window.onStateChange
>
type CallableAppShellRpcChannel =
  | CallableSettingsRpcChannel
  | CallableProjectsRpcChannel
  | CallableWindowRpcChannel

/**
 * app-shell RPC handler 每次调用可读取的 Electron 请求上下文。
 */
export type AppShellRpcRequestContext = {
  event: IpcMainInvokeEvent
}

const appShellIpcChannelByRpcChannel: Record<CallableAppShellRpcChannel, string> = {
  [RPC_CHANNELS.settings.get]: ipcChannels.settings.get,
  [RPC_CHANNELS.settings.createCustomProvider]: ipcChannels.settings.createCustomProvider,
  [RPC_CHANNELS.settings.createCustomAcpProvider]: ipcChannels.settings.createCustomAcpProvider,
  [RPC_CHANNELS.settings.saveProvider]: ipcChannels.settings.saveProvider,
  [RPC_CHANNELS.settings.deleteProvider]: ipcChannels.settings.deleteProvider,
  [RPC_CHANNELS.settings.fetchProviderModels]: ipcChannels.settings.fetchProviderModels,
  [RPC_CHANNELS.settings.testProvider]: ipcChannels.settings.testProvider,
  [RPC_CHANNELS.settings.saveAppearance]: ipcChannels.settings.saveAppearance,

  [RPC_CHANNELS.projects.list]: ipcChannels.projects.list,
  [RPC_CHANNELS.projects.getActive]: ipcChannels.projects.getActive,
  [RPC_CHANNELS.projects.useExistingFolder]: ipcChannels.projects.useExistingFolder,
  [RPC_CHANNELS.projects.delete]: ipcChannels.projects.delete,
  [RPC_CHANNELS.projects.setActive]: ipcChannels.projects.setActive,

  [RPC_CHANNELS.window.close]: ipcChannels.window.close,
  [RPC_CHANNELS.window.minimize]: ipcChannels.window.minimize,
  [RPC_CHANNELS.window.toggleMaximize]: ipcChannels.window.toggleMaximize,
  [RPC_CHANNELS.window.openSettings]: ipcChannels.window.openSettings,
  [RPC_CHANNELS.window.getState]: ipcChannels.window.getState
}

/**
 * 创建 Electron IPC 版 app-shell RPC server port，供 app-shell handler 注册器写入 handler。
 */
export function createAppShellIpcRpcServer(): RpcServerPort<AppShellRpcRequestContext> {
  return createLegacyIpcRpcServer<AppShellRpcRequestContext, CallableAppShellRpcChannel>({
    channelMap: appShellIpcChannelByRpcChannel,
    createContext: createAppShellRpcRequestContext
  })
}

/**
 * 为单次 IPC 调用创建 app-shell request context，供 window handler 定位 sender 窗口。
 */
function createAppShellRpcRequestContext(event: IpcMainInvokeEvent): AppShellRpcRequestContext {
  return { event }
}
