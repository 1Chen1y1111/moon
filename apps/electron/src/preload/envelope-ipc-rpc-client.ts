/**
 * 负责把 preload RPC client 适配到 Electron 内部 envelope IPC。
 * 本文件在 preload 内部使用 MessageEnvelope 语义，但不改变 renderer 可见 API 或 IPC channel。
 */

import type { IpcRenderer } from 'electron'

import {
  EnvelopeRpcClient,
  type EnvelopeRpcClientSubscribe,
  type RpcClientPort
} from '@moon/server-core/transport'
import {
  isErrorCode,
  type MessageEnvelope,
  type WireError
} from '@moon/shared/protocol'
import { ipcChannels } from '@ipc/channels'

/**
 * preload 中实际会调用的 Electron ipcRenderer 子集，方便单测注入 fake。
 */
export type IpcRendererBridge = Pick<IpcRenderer, 'invoke' | 'on' | 'off'>

export type EnvelopeIpcRpcClientOptions = {
  /**
   * 创建 envelope id；测试可注入固定 id，运行时由 EnvelopeRpcClient 默认生成 request id。
   */
  createId?: () => string
}

/**
 * 创建基于 Electron envelope IPC 的 RPC client。
 */
export function createEnvelopeIpcRpcClient(
  ipcRenderer: IpcRendererBridge,
  options: EnvelopeIpcRpcClientOptions = {}
): RpcClientPort {
  return new EnvelopeRpcClient({
    createId: options.createId,
    request: (envelope) => requestElectronIpcEnvelope(ipcRenderer, envelope),
    subscribe: createElectronIpcEnvelopeSubscription(ipcRenderer)
  })
}

/**
 * 将 request envelope 发送到 main 侧 unified envelope dispatcher。
 */
async function requestElectronIpcEnvelope(
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
    return (await ipcRenderer.invoke(ipcChannels.rpc.request, envelope)) as MessageEnvelope
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
 * 订阅 main 侧 event envelope stream。
 */
function createElectronIpcEnvelopeSubscription(
  ipcRenderer: IpcRendererBridge
): EnvelopeRpcClientSubscribe {
  return (listener) => {
    const handler = (_event: unknown, envelope: MessageEnvelope): void => {
      listener(envelope)
    }

    ipcRenderer.on(ipcChannels.rpc.event, handler)
    return () => {
      ipcRenderer.off(ipcChannels.rpc.event, handler)
    }
  }
}

/**
 * 将 IPC rejection 转成 WireError，保留可识别的协议错误码。
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
