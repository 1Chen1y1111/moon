/**
 * 负责把 server-core sessions RPC 注册口适配到 Electron IPC。
 * 本文件只保留 sessions 专属 channel map 和 `session:event` bridge。
 */

import type { IpcMainInvokeEvent } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type { RpcServerPort, SessionRpcRequestContext } from '@moon/server-core/handlers'
import { pushTyped, type RpcPushPort } from '@moon/server-core/transport'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import { RPC_CHANNELS, type PushTarget, type SessionRpcChannel } from '@moon/shared/protocol'
import { createLegacyIpcRpcServer } from './legacy-ipc-rpc-server'
import { getLegacyWebContentsClientId } from './legacy-webcontents-client-registry'

type CallableSessionRpcChannel = Exclude<SessionRpcChannel, typeof RPC_CHANNELS.sessions.event>

const sessionIpcChannelByRpcChannel: Record<CallableSessionRpcChannel, string> = {
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
  [RPC_CHANNELS.sessions.rejectToolCall]: ipcChannels.chat.rejectToolCall
}

/**
 * 创建 Electron IPC 版 sessions RPC server port，供 server-core 注册器写入 handler。
 */
export function createSessionIpcRpcServer(): RpcServerPort<SessionRpcRequestContext> &
  RpcPushPort {
  let rpcServer!: RpcServerPort<SessionRpcRequestContext> & RpcPushPort

  rpcServer = createLegacyIpcRpcServer<SessionRpcRequestContext, CallableSessionRpcChannel>({
    channelMap: sessionIpcChannelByRpcChannel,
    createContext: (event) => createSessionIpcRequestContext(event, rpcServer)
  })

  return rpcServer
}

/**
 * 为单次 IPC 调用创建 request context，内部 `session:event` 会回到当前调用窗口。
 */
function createSessionIpcRequestContext(
  event: IpcMainInvokeEvent,
  rpcServer: RpcPushPort
): SessionRpcRequestContext {
  const clientId = getLegacyWebContentsClientId(event.sender)

  return {
    emitSessionEvent: (eventChannel, operationEvent) => {
      emitSessionEvent(rpcServer, eventChannel, operationEvent, clientId)
    }
  }
}

/**
 * 把内部 `session:event` 按事件自身携带的 workspace 线索发送到目标窗口。
 */
function emitSessionEvent(
  rpcServer: RpcPushPort,
  eventChannel: typeof RPC_CHANNELS.sessions.event,
  operationEvent: ChatOperationEvent,
  clientId: string
): void {
  if (eventChannel !== RPC_CHANNELS.sessions.event) {
    return
  }

  pushTyped(
    rpcServer,
    eventChannel,
    resolveSessionEventPushTarget(operationEvent, clientId),
    operationEvent
  )
}

/**
 * 优先使用事件 payload 中明确携带的 projectId 做 workspace 定向。
 * 缺失时保持当前 client 范围。
 */
function resolveSessionEventPushTarget(
  operationEvent: ChatOperationEvent,
  fallbackClientId: string
): PushTarget {
  if ('session' in operationEvent && operationEvent.session.projectId !== null) {
    return { to: 'workspace', workspaceId: operationEvent.session.projectId }
  }

  return { to: 'client', clientId: fallbackClientId }
}
