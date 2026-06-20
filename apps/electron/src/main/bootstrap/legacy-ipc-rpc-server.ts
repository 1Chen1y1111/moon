/**
 * 负责把当前 Electron legacy IPC channel 适配为通用 RPC server/push port。
 * 本文件只处理 IPC transport、MessageEnvelope 调度和本地事件推送，不承载具体业务 handler。
 */

import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import type { RpcRequestHandler, RpcServerPort } from '@moon/server-core/handlers'
import { EnvelopeRpcServer, type RpcPushPort } from '@moon/server-core/transport'
import type { BroadcastEventChannel, MessageEnvelope, WireError } from '@moon/shared/protocol'
import { emitLegacyRpcEvent } from './legacy-rpc-event-bridge'

/**
 * 创建 legacy IPC RPC server 时需要的 transport 映射和上下文工厂。
 */
export type LegacyIpcRpcServerOptions<TContext, TChannel extends string = string> = {
  channelMap: Readonly<Record<TChannel, string>>
  createContext: (event: IpcMainInvokeEvent) => TContext
}

/**
 * 创建 Electron legacy IPC 版 RPC server/push port，把 invoke 包进 envelope，并把 push 转给事件桥。
 */
export function createLegacyIpcRpcServer<TContext, TChannel extends string = string>({
  channelMap,
  createContext
}: LegacyIpcRpcServerOptions<TContext, TChannel>): RpcServerPort<TContext> & RpcPushPort {
  const envelopeServer = new EnvelopeRpcServer<TContext>()

  return {
    handle: <TArgs extends readonly unknown[], TResult>(
      channel: string,
      handler: RpcRequestHandler<TContext, TArgs, TResult>
    ) => {
      const ipcChannel = resolveLegacyIpcChannel(channelMap, channel)

      envelopeServer.handle(channel, handler)
      ipcMain.handle(ipcChannel, async (event, ...args: unknown[]) => {
        const response = await envelopeServer.dispatch(
          createContext(event),
          createRequestEnvelope(channel, args)
        )

        if (response.error) {
          throw createIpcError(response.error)
        }

        return response.result
      })
    },
    push: (channel, target, ...args) => {
      emitLegacyRpcEvent(channel as BroadcastEventChannel, target, ...(args as never))
    }
  }
}

/**
 * 为单次旧 IPC 调用创建内部 request envelope；该 envelope 不暴露给 renderer。
 */
function createRequestEnvelope(channel: string, args: unknown[]): MessageEnvelope {
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
 * 将内部 RPC channel 解析为当前 legacy IPC channel。
 */
function resolveLegacyIpcChannel<TChannel extends string>(
  channelMap: Readonly<Record<TChannel, string>>,
  channel: string
): string {
  const ipcChannel = channelMap[channel as TChannel]

  if (ipcChannel === undefined) {
    throw new Error(`Unsupported legacy IPC RPC channel: ${channel}`)
  }

  return ipcChannel
}
