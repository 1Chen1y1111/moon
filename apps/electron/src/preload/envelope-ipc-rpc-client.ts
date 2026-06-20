/**
 * 负责把 preload workspace RPC client 适配到当前 Electron legacy IPC。
 * 本文件在 preload 内部使用 MessageEnvelope 语义，但不改变 renderer 可见 API 或 IPC channel。
 */

import {
  EnvelopeRpcClient,
  type EnvelopeRpcClientSubscribe,
  type RpcClientPort
} from '@moon/server-core/transport'
import {
  isErrorCode,
  RPC_CHANNELS,
  type BroadcastEventChannel,
  type MessageEnvelope,
  type WireError
} from '@moon/shared/protocol'
import { resolveIpcChannel, type IpcRendererBridge } from './ipc-rpc-channels'

export type EnvelopeIpcRpcClientOptions = {
  /**
   * 创建 envelope id；测试可注入固定 id，运行时由 EnvelopeRpcClient 默认生成 request id。
   */
  createId?: () => string
}

const BROADCAST_EVENT_CHANNELS: readonly BroadcastEventChannel[] = [
  RPC_CHANNELS.sessions.event,
  RPC_CHANNELS.settings.onChange,
  RPC_CHANNELS.projects.onChange,
  RPC_CHANNELS.window.onStateChange
]

/**
 * 创建基于 Electron legacy IPC 的 envelope RPC client。
 */
export function createEnvelopeIpcRpcClient(
  ipcRenderer: IpcRendererBridge,
  options: EnvelopeIpcRpcClientOptions = {}
): RpcClientPort {
  return new EnvelopeRpcClient({
    createId: options.createId,
    request: (envelope) => requestLegacyIpcEnvelope(ipcRenderer, envelope),
    subscribe: createLegacyIpcEnvelopeSubscription(ipcRenderer, options)
  })
}

/**
 * 将 request envelope 转为旧 IPC invoke，并把结果重新包装成 response envelope。
 */
async function requestLegacyIpcEnvelope(
  ipcRenderer: IpcRendererBridge,
  envelope: MessageEnvelope
): Promise<MessageEnvelope> {
  const channel = envelope.channel

  if (!channel) {
    return {
      id: envelope.id,
      type: 'response',
      error: {
        code: 'CHANNEL_NOT_FOUND',
        message: 'Missing channel'
      }
    }
  }

  try {
    const result = await invokeLegacyIpc(ipcRenderer, resolveIpcChannel(channel), envelope.args ?? [])

    return {
      id: envelope.id,
      type: 'response',
      channel,
      result
    }
  } catch (error) {
    return {
      id: envelope.id,
      type: 'response',
      channel,
      error: createWireError(error)
    }
  }
}

/**
 * 调用旧 IPC channel，并保持无参数调用不额外传 undefined。
 */
function invokeLegacyIpc(
  ipcRenderer: IpcRendererBridge,
  ipcChannel: string,
  args: unknown[]
): Promise<unknown> {
  if (args.length === 0) {
    return ipcRenderer.invoke(ipcChannel)
  }

  return ipcRenderer.invoke(ipcChannel, ...args)
}

/**
 * 订阅当前 legacy IPC event channel，并把 raw payload 包装为 event envelope。
 */
function createLegacyIpcEnvelopeSubscription(
  ipcRenderer: IpcRendererBridge,
  options: EnvelopeIpcRpcClientOptions
): EnvelopeRpcClientSubscribe {
  return (listener) => {
    const unsubscribeHandlers = BROADCAST_EVENT_CHANNELS.map((channel) => {
      const ipcChannel = resolveIpcChannel(channel)
      const handler = (_event: unknown, ...args: unknown[]): void => {
        listener({
          id: options.createId?.() ?? `${channel}:event`,
          type: 'event',
          channel,
          args
        })
      }

      ipcRenderer.on(ipcChannel, handler)

      return () => {
        ipcRenderer.off(ipcChannel, handler)
      }
    })

    return () => {
      for (const unsubscribe of unsubscribeHandlers) {
        unsubscribe()
      }
    }
  }
}

/**
 * 将旧 IPC rejection 转成 WireError，保留可识别的协议错误码。
 */
function createWireError(error: unknown): WireError {
  const rawCode = (error as { code?: unknown } | null)?.code

  return {
    code: isErrorCode(rawCode) ? rawCode : 'HANDLER_ERROR',
    message: getErrorMessage(error)
  }
}

/**
 * 从未知错误中提取可读消息，供 response envelope 返回给 EnvelopeRpcClient。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
