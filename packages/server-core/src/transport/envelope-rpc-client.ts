/**
 * 提供基于 MessageEnvelope 的 transport-neutral RPC client。
 * 它只负责 request envelope 编码、response 解包和 event envelope 订阅过滤。
 */

import { randomUUID } from 'node:crypto'

import type { MessageEnvelope, WireError } from '@moon/shared/protocol'

import type { RpcClientListener, RpcClientPort } from './types'

export type EnvelopeRpcClientRequest = (envelope: MessageEnvelope) => Promise<MessageEnvelope>

export type EnvelopeRpcClientEnvelopeListener = (envelope: MessageEnvelope) => void

export type EnvelopeRpcClientSubscribe = (
  listener: EnvelopeRpcClientEnvelopeListener
) => () => void

export type EnvelopeRpcClientOptions = {
  /**
   * 发送 request envelope，并返回 transport 收到的 response envelope。
   */
  request: EnvelopeRpcClientRequest

  /**
   * 订阅 transport 收到的 event envelope，返回取消订阅函数。
   */
  subscribe: EnvelopeRpcClientSubscribe

  /**
   * 创建 request envelope id；测试可注入固定 id，运行时默认使用 randomUUID。
   */
  createId?: () => string
}

/**
 * 将 RpcClientPort 调用转换成 envelope request/response 和 event 订阅语义。
 */
export class EnvelopeRpcClient implements RpcClientPort {
  private readonly createId: () => string
  private readonly request: EnvelopeRpcClientRequest
  private readonly subscribeToEnvelopes: EnvelopeRpcClientSubscribe

  /**
   * 创建 envelope RPC client，只依赖底层 transport 的 request 和 subscribe 能力。
   */
  constructor({ createId = randomUUID, request, subscribe }: EnvelopeRpcClientOptions) {
    this.createId = createId
    this.request = request
    this.subscribeToEnvelopes = subscribe
  }

  /**
   * 发送 request envelope，并把 response envelope 还原成调用结果或带 code 的 Error。
   */
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const requestEnvelope = createRequestEnvelope(this.createId(), channel, args)
    const responseEnvelope = await this.request(requestEnvelope)

    if (responseEnvelope.type !== 'response') {
      throw new Error(`Expected response envelope, received: ${responseEnvelope.type}`)
    }

    if (responseEnvelope.error) {
      throw createResponseError(responseEnvelope.error)
    }

    return responseEnvelope.result
  }

  /**
   * 订阅指定 event channel，并只把匹配的 event envelope 参数展开给 listener。
   */
  on(channel: string, listener: RpcClientListener): () => void {
    return this.subscribeToEnvelopes((envelope) => {
      if (envelope.type !== 'event' || envelope.channel !== channel) {
        return
      }

      listener(...(envelope.args ?? []))
    })
  }
}

/**
 * 创建 request envelope，参数数组保持调用方传入的原始 shape。
 */
function createRequestEnvelope(id: string, channel: string, args: unknown[]): MessageEnvelope {
  return {
    id,
    type: 'request',
    channel,
    args
  }
}

/**
 * 将 WireError 还原成普通 Error，并把 code 保留给上层判断。
 */
function createResponseError(error: WireError): Error & { code: WireError['code'] } {
  const responseError = new Error(error.message) as Error & { code: WireError['code'] }
  responseError.code = error.code
  return responseError
}
