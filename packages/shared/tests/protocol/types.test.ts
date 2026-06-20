/**
 * 负责验证 Moon 内部 RPC wire envelope 和错误协议类型。
 * 这些测试只覆盖 shared protocol contract，不触发具体 transport。
 */

import { describe, expect, it } from 'vitest'

import {
  CodedError,
  PROTOCOL_VERSION,
  isErrorCode,
  type ErrorCode,
  type MessageEnvelope,
  type PushTarget,
  type WireError
} from '@moon/shared/protocol'

describe('protocol wire types', () => {
  it('keeps the protocol version stable', () => {
    expect(PROTOCOL_VERSION).toBe('1.0')
  })

  it('supports request, response, event, error, and handshake envelopes', () => {
    const request = {
      id: 'request-1',
      type: 'request',
      channel: 'sessions:getMessages',
      args: [{ sessionId: 'session-1' }]
    } satisfies MessageEnvelope
    const response = {
      id: 'request-1',
      type: 'response',
      channel: 'sessions:getMessages',
      result: []
    } satisfies MessageEnvelope
    const event = {
      id: 'event-1',
      type: 'event',
      channel: 'session:event',
      args: [{ type: 'message-delta', operationId: 'operation-1' }]
    } satisfies MessageEnvelope
    const error = {
      id: 'request-2',
      type: 'error',
      channel: 'sessions:sendMessage',
      error: {
        code: 'HANDLER_ERROR',
        message: 'handler failed'
      }
    } satisfies MessageEnvelope
    const handshake = {
      id: 'handshake-1',
      type: 'handshake',
      protocolVersion: PROTOCOL_VERSION,
      authToken: 'workspace-secret',
      clientCapabilities: ['client:testEcho'],
      clientId: 'client-1',
      workspaceId: 'workspace-1'
    } satisfies MessageEnvelope

    expect(request.args).toEqual([{ sessionId: 'session-1' }])
    expect(response.result).toEqual([])
    expect(event.channel).toBe('session:event')
    expect(error.error?.code).toBe('HANDLER_ERROR')
    expect(handshake.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(handshake.authToken).toBe('workspace-secret')
    expect(handshake.clientCapabilities).toEqual(['client:testEcho'])
  })

  it('recognizes supported error codes only', () => {
    const supportedCodes: ErrorCode[] = [
      'HANDLER_ERROR',
      'CHANNEL_NOT_FOUND',
      'REQUEST_TIMEOUT',
      'PROTOCOL_VERSION_UNSUPPORTED',
      'AUTHENTICATION_FAILED',
      'CAPABILITY_UNAVAILABLE',
      'CLIENT_DISCONNECTED'
    ]

    expect(supportedCodes.every(isErrorCode)).toBe(true)
    expect(isErrorCode('AUTH_FAILED')).toBe(false)
    expect(isErrorCode(undefined)).toBe(false)
  })

  it('carries structured error details through WireError and CodedError', () => {
    const wireError = {
      code: 'REQUEST_TIMEOUT',
      message: 'request timed out',
      data: { timeoutMs: 30_000 }
    } satisfies WireError
    const codedError = new CodedError('CHANNEL_NOT_FOUND', 'missing channel')

    expect(wireError.data).toEqual({ timeoutMs: 30_000 })
    expect(codedError).toBeInstanceOf(Error)
    expect(codedError.name).toBe('CodedError')
    expect(codedError.code).toBe('CHANNEL_NOT_FOUND')
    expect(codedError.message).toBe('missing channel')
  })

  it('describes push targets for future event transports', () => {
    const targets: PushTarget[] = [
      { to: 'all' },
      { to: 'workspace', workspaceId: 'workspace-1', exclude: 'client-1' },
      { to: 'client', clientId: 'client-2' }
    ]

    expect(targets).toEqual([
      { to: 'all' },
      { to: 'workspace', workspaceId: 'workspace-1', exclude: 'client-1' },
      { to: 'client', clientId: 'client-2' }
    ])
  })
})
