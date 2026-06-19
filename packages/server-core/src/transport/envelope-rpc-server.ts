/**
 * 提供基于 MessageEnvelope 的内存 RPC dispatcher。
 * 它复用 RpcServerPort 注册的 handler，但不创建网络连接或 Electron IPC 绑定。
 */

import {
  CodedError,
  isErrorCode,
  type ErrorCode,
  type MessageEnvelope,
  type WireError
} from '@moon/shared/protocol'

import type { RpcRequestHandler, RpcServerPort } from '../handlers/types'

type RegisteredRpcHandler<TContext> = RpcRequestHandler<TContext, readonly unknown[], unknown>

/**
 * 内存版 envelope RPC server，用于把 transport envelope 调度到已注册 handler。
 */
export class EnvelopeRpcServer<TContext = unknown> implements RpcServerPort<TContext> {
  private readonly handlers = new Map<string, RegisteredRpcHandler<TContext>>()

  /**
   * 注册一个 RPC channel 对应的 handler。
   */
  handle<TArgs extends readonly unknown[], TResult>(
    channel: string,
    handler: RpcRequestHandler<TContext, TArgs, TResult>
  ): void {
    this.handlers.set(channel, handler as RegisteredRpcHandler<TContext>)
  }

  /**
   * 调度 request envelope，并返回同 id/channel 的 response envelope。
   */
  async dispatch(context: TContext, envelope: MessageEnvelope): Promise<MessageEnvelope> {
    if (envelope.type !== 'request') {
      return createErrorResponse(
        envelope,
        'HANDLER_ERROR',
        `Unsupported envelope type: ${envelope.type}`
      )
    }

    const channel = envelope.channel

    if (typeof channel !== 'string' || channel.length === 0) {
      return createErrorResponse(envelope, 'CHANNEL_NOT_FOUND', 'Missing channel')
    }

    const handler = this.handlers.get(channel)

    if (!handler) {
      return createErrorResponse(envelope, 'CHANNEL_NOT_FOUND', `No handler for: ${channel}`)
    }

    try {
      const result = await handler(context, ...(envelope.args ?? []))

      return {
        id: envelope.id,
        type: 'response',
        channel,
        result
      }
    } catch (error) {
      return createErrorResponse(envelope, selectErrorCode(error), getErrorMessage(error))
    }
  }
}

/**
 * 创建失败 response envelope，保留 request id 和 channel 方便调用方关联。
 */
function createErrorResponse(
  envelope: MessageEnvelope,
  code: ErrorCode,
  message: string
): MessageEnvelope {
  const error: WireError = {
    code,
    message
  }

  return {
    id: envelope.id,
    type: 'response',
    channel: envelope.channel,
    error
  }
}

/**
 * 从未知错误中提取可跨 wire 传递的错误码。
 */
function selectErrorCode(error: unknown): ErrorCode {
  if (error instanceof CodedError) {
    return error.code
  }

  const rawCode = (error as { code?: unknown } | null)?.code

  return isErrorCode(rawCode) ? rawCode : 'HANDLER_ERROR'
}

/**
 * 从未知错误中提取可读错误消息。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
