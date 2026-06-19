/**
 * 负责把 server-core sessions RPC 注册口适配到 Electron IPC。
 * 本文件只保留 sessions 专属 channel map 和 `session:event` bridge。
 */

import type { IpcMainInvokeEvent } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type { RpcServerPort, SessionRpcRequestContext } from '@moon/server-core/handlers'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import { RPC_CHANNELS, type SessionRpcChannel } from '@moon/shared/protocol'
import { createLegacyIpcRpcServer } from './legacy-ipc-rpc-server'

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
export function createSessionIpcRpcServer(): RpcServerPort<SessionRpcRequestContext> {
  return createLegacyIpcRpcServer<SessionRpcRequestContext, CallableSessionRpcChannel>({
    channelMap: sessionIpcChannelByRpcChannel,
    createContext: createSessionIpcRequestContext
  })
}

/**
 * 为单次 IPC 调用创建 request context，内部 `session:event` 会回到当前调用窗口。
 */
function createSessionIpcRequestContext(event: IpcMainInvokeEvent): SessionRpcRequestContext {
  return {
    emitSessionEvent: (eventChannel, operationEvent) => {
      emitSessionEvent(eventChannel, operationEvent, event)
    }
  }
}

/**
 * 把内部 `session:event` 发送到当前调用窗口。
 */
function emitSessionEvent(
  eventChannel: typeof RPC_CHANNELS.sessions.event,
  operationEvent: ChatOperationEvent,
  event: IpcMainInvokeEvent
): void {
  if (eventChannel !== RPC_CHANNELS.sessions.event) {
    return
  }

  event.sender.send(ipcChannels.chat.sessionEvent, operationEvent)
}
