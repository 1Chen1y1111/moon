/**
 * 定义 Moon 内部 RPC wire envelope 和错误协议类型。
 * 本文件只描述 transport-neutral wire contract，不绑定 WebSocket、Electron IPC 或具体 runtime。
 */

/**
 * RPC wire message 的基础类型，后续 transport codec 会按该字段分派处理流程。
 */
export type MessageType =
  | 'handshake'
  | 'handshake_ack'
  | 'request'
  | 'response'
  | 'event'
  | 'error'

/**
 * Moon 当前协议层识别的错误码集合。
 */
export type ErrorCode =
  | 'HANDLER_ERROR'
  | 'CHANNEL_NOT_FOUND'
  | 'REQUEST_TIMEOUT'
  | 'PROTOCOL_VERSION_UNSUPPORTED'
  | 'AUTHENTICATION_FAILED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CLIENT_DISCONNECTED'

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'HANDLER_ERROR',
  'CHANNEL_NOT_FOUND',
  'REQUEST_TIMEOUT',
  'PROTOCOL_VERSION_UNSUPPORTED',
  'AUTHENTICATION_FAILED',
  'CAPABILITY_UNAVAILABLE',
  'CLIENT_DISCONNECTED'
])

/**
 * transport 边界上传递的结构化错误，不依赖 Error 实例身份。
 */
export type WireError = {
  code: ErrorCode
  message: string
  data?: unknown
}

/**
 * RPC request、response、event、error 和 handshake 共用的 wire envelope。
 */
export type MessageEnvelope = {
  id: string
  type: MessageType
  channel?: string
  args?: unknown[]
  result?: unknown
  error?: WireError
  protocolVersion?: string
  authToken?: string
  clientCapabilities?: string[]
  clientId?: string
  workspaceId?: string
}

/**
 * server 向客户端推送事件时使用的目标选择语义。
 */
export type PushTarget =
  | { to: 'all'; exclude?: string }
  | { to: 'workspace'; workspaceId: string; exclude?: string }
  | { to: 'client'; clientId: string }

/**
 * Moon 内部 RPC 协议版本，后续 handshake 会用它做兼容性判断。
 */
export const PROTOCOL_VERSION = '1.0'

/**
 * 判断未知值是否是 Moon 当前协议层支持的错误码。
 */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && KNOWN_ERROR_CODES.has(value)
}

/**
 * 在发送侧携带错误码的 Error；跨 wire 后接收侧应读取 code，而不是依赖 instanceof。
 */
export class CodedError extends Error {
  readonly code: ErrorCode

  /**
   * 创建可被 transport codec 转换为 WireError 的错误对象。
   */
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'CodedError'
  }
}
