/**
 * 定义 Moon 内部 RPC channel 的路由分类，边界止于纯协议语义。
 * 这里不决定具体传输，只为 preload/client 后续选择本地或远程路径提供稳定依据。
 */

import { RPC_CHANNELS, type RpcChannel } from './channels'

type ChannelGroup = Record<string, RpcChannel>

/**
 * 从单个协议领域对象中提取稳定 channel 值，保留字面量联合类型。
 */
function getChannelGroupValues<T extends ChannelGroup>(channels: T): Array<T[keyof T]> {
  return Object.values(channels) as Array<T[keyof T]>
}

const SESSION_CHANNELS = getChannelGroupValues(RPC_CHANNELS.sessions)
const SETTINGS_CHANNELS = getChannelGroupValues(RPC_CHANNELS.settings)
const PROJECTS_CHANNELS = getChannelGroupValues(RPC_CHANNELS.projects)
const WINDOW_CHANNELS = getChannelGroupValues(RPC_CHANNELS.window)

/**
 * 只能由当前 Electron 本地能力处理的 channel 集合。
 */
export const LOCAL_ONLY_CHANNELS: ReadonlySet<RpcChannel> = new Set([
  ...SETTINGS_CHANNELS,
  ...PROJECTS_CHANNELS,
  ...WINDOW_CHANNELS
])

/**
 * 可以进入远程 server transport 的 channel 集合。
 */
export const REMOTE_ELIGIBLE_CHANNELS: ReadonlySet<RpcChannel> = new Set(SESSION_CHANNELS)

/**
 * 返回当前协议表里声明过的所有 channel 值，用于路由完整性校验。
 */
export function getAllChannelValues(): RpcChannel[] {
  return [
    ...SESSION_CHANNELS,
    ...SETTINGS_CHANNELS,
    ...PROJECTS_CHANNELS,
    ...WINDOW_CHANNELS
  ]
}

/**
 * 判断某个 channel 是否必须走本地 Electron 能力。
 */
export function isLocalOnly(channel: string): boolean {
  return LOCAL_ONLY_CHANNELS.has(channel as RpcChannel)
}

/**
 * 判断某个 channel 是否具备远程 transport 路由资格。
 */
export function isRemoteEligible(channel: string): boolean {
  return REMOTE_ELIGIBLE_CHANNELS.has(channel as RpcChannel)
}
