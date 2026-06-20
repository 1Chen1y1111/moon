/**
 * 负责 Moon RPC envelope 的基础序列化、反序列化和 shape 校验。
 * 本层只处理纯 JSON wire 结构，不绑定 WebSocket、Electron IPC 或具体业务 handler。
 */

import { isErrorCode, type MessageEnvelope, type MessageType } from '@moon/shared/protocol'

const MESSAGE_TYPES = new Set<MessageType>([
  'handshake',
  'handshake_ack',
  'request',
  'response',
  'event',
  'error'
])

/**
 * 判断未知值是否是可检查字段的普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 判断未知值是否满足 WireError 的最小 wire shape。
 */
function isWireError(value: unknown): boolean {
  return isRecord(value) && isErrorCode(value.code) && typeof value.message === 'string'
}

/**
 * 校验未知值是否满足 Moon 当前 MessageEnvelope wire shape。
 */
export function validateEnvelopeShape(value: unknown): value is MessageEnvelope {
  if (!isRecord(value)) {
    return false
  }

  if (typeof value.id !== 'string' || value.id.length === 0) {
    return false
  }

  if (typeof value.type !== 'string' || !MESSAGE_TYPES.has(value.type as MessageType)) {
    return false
  }

  if (value.channel !== undefined && typeof value.channel !== 'string') {
    return false
  }

  if (value.args !== undefined && !Array.isArray(value.args)) {
    return false
  }

  if (value.error !== undefined && !isWireError(value.error)) {
    return false
  }

  if (value.protocolVersion !== undefined && typeof value.protocolVersion !== 'string') {
    return false
  }

  if (value.authToken !== undefined && typeof value.authToken !== 'string') {
    return false
  }

  if (
    value.clientCapabilities !== undefined &&
    (!Array.isArray(value.clientCapabilities) ||
      !value.clientCapabilities.every((capability) => typeof capability === 'string'))
  ) {
    return false
  }

  if (value.clientId !== undefined && typeof value.clientId !== 'string') {
    return false
  }

  if (value.workspaceId !== undefined && typeof value.workspaceId !== 'string') {
    return false
  }

  return true
}

/**
 * 把 MessageEnvelope 序列化为 JSON 字符串。
 */
export function serializeEnvelope(envelope: MessageEnvelope): string {
  return JSON.stringify(envelope)
}

/**
 * 从 JSON 字符串解析 MessageEnvelope；非法 JSON 或非法 envelope shape 都会抛出普通 Error。
 */
export function deserializeEnvelope(raw: string): MessageEnvelope {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid RPC envelope JSON')
  }

  if (!validateEnvelopeShape(parsed)) {
    throw new Error('Invalid RPC envelope shape')
  }

  return parsed
}
