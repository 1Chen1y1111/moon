/**
 * 负责把 server-core sessions RPC 注册口适配到 Electron IPC。
 * 本文件把旧 `chat:*` IPC 调用包装成内部 MessageEnvelope，再交给 server-core dispatcher。
 */

import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type {
  RpcRequestHandler,
  RpcServerPort,
  SessionRpcRequestContext
} from '@moon/server-core/handlers'
import { EnvelopeRpcServer } from '@moon/server-core/transport'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import {
  RPC_CHANNELS,
  type MessageEnvelope,
  type SessionRpcChannel,
  type WireError
} from '@moon/shared/protocol'

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
  const envelopeServer = new EnvelopeRpcServer<SessionRpcRequestContext>()

  return {
    handle: <TArgs extends readonly unknown[], TResult>(
      channel: string,
      handler: RpcRequestHandler<SessionRpcRequestContext, TArgs, TResult>
    ) => {
      const ipcChannel = resolveSessionIpcChannel(channel)

      envelopeServer.handle(channel, handler)
      ipcMain.handle(ipcChannel, async (event, ...args: unknown[]) => {
        const response = await envelopeServer.dispatch(
          createSessionIpcRequestContext(event),
          createSessionRequestEnvelope(channel, args)
        )

        if (response.error) {
          throw createIpcError(response.error)
        }

        return response.result
      })
    }
  }
}

/**
 * 为一次旧 IPC 调用创建内部 request envelope；该 envelope 不暴露给 renderer。
 */
function createSessionRequestEnvelope(channel: string, args: unknown[]): MessageEnvelope {
  return {
    id: randomUUID(),
    type: 'request',
    channel,
    args
  }
}

/**
 * 把 wire error 还原成 Electron IPC 可以 reject 的 Error，并保留协议错误码。
 */
function createIpcError(error: WireError): Error {
  const ipcError = new Error(error.message) as Error & { code?: WireError['code'] }

  ipcError.code = error.code

  return ipcError
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
