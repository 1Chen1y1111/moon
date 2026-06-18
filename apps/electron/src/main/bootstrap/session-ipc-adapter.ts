/**
 * 负责把 server-core sessions RPC 注册口适配到 Electron IPC。
 * 本文件只维护 `sessions:*` 到现有 `chat:*` wire channel 的映射，不改变 renderer contract。
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type {
  RpcRequestHandler,
  RpcServerPort,
  SessionRpcRequestContext
} from '@moon/server-core/handlers'
import type { SessionEventSink } from '@moon/server-core/sessions'
import { RPC_CHANNELS, type SessionRpcChannel } from '@moon/shared/protocol'

type CallableSessionRpcChannel = Exclude<
  SessionRpcChannel,
  typeof RPC_CHANNELS.sessions.event
>

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
  return {
    handle: <TArgs extends readonly unknown[], TResult>(
      channel: string,
      handler: RpcRequestHandler<SessionRpcRequestContext, TArgs, TResult>
    ) => {
      const ipcChannel = resolveSessionIpcChannel(channel)

      ipcMain.handle(ipcChannel, (event, ...args: unknown[]) =>
        handler(createSessionIpcRequestContext(channel, event), ...(args as unknown as TArgs))
      )
    }
  }
}

/**
 * 将 server-core sessions RPC channel 映射为当前 Electron IPC chat channel。
 */
function resolveSessionIpcChannel(channel: string): string {
  const ipcChannel = sessionIpcChannelByRpcChannel[channel as CallableSessionRpcChannel]

  if (ipcChannel === undefined) {
    throw new Error(`Unsupported session RPC channel: ${channel}`)
  }

  return ipcChannel
}

/**
 * 为单次 IPC 调用创建 request context，流式事件会回到当前调用窗口。
 */
function createSessionIpcRequestContext(
  channel: string,
  event: IpcMainInvokeEvent
): SessionRpcRequestContext {
  return {
    eventSink: createSessionEventSink(channel, event)
  }
}

/**
 * 根据不同会话运行入口选择旧 IPC 事件 channel，保持 renderer 行为不变。
 */
function createSessionEventSink(
  channel: string,
  event: IpcMainInvokeEvent
): SessionEventSink | undefined {
  if (channel === RPC_CHANNELS.sessions.runOperation) {
    return (operationEvent) => {
      event.sender.send(ipcChannels.chat.operationEvent, operationEvent)
    }
  }

  if (channel === RPC_CHANNELS.sessions.sendMessage) {
    return (messageEvent) => {
      event.sender.send(ipcChannels.chat.sendMessageEvent, messageEvent)
    }
  }

  return undefined
}
