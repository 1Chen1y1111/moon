// @vitest-environment node

/**
 * 负责验证 server-core transport codec 的 envelope 序列化和 shape 校验。
 * 测试不创建真实网络连接或 Electron IPC。
 */

import { describe, expect, it } from 'vitest'

import {
  CLIENT_TEST_ECHO,
  deserializeEnvelope,
  serializeEnvelope,
  validateEnvelopeShape
} from '@moon/server-core/transport'
import type { MessageEnvelope } from '@moon/shared/protocol'

describe('transport codec', () => {
  it('serializes and deserializes valid envelopes', () => {
    const envelope = {
      id: 'request-1',
      type: 'request',
      channel: 'sessions:getMessages',
      args: [{ sessionId: 'session-1' }]
    } satisfies MessageEnvelope

    expect(deserializeEnvelope(serializeEnvelope(envelope))).toEqual(envelope)
  })

  it('accepts handshake envelopes with advertised client capabilities', () => {
    const envelope = {
      id: 'handshake-1',
      type: 'handshake',
      clientCapabilities: [CLIENT_TEST_ECHO]
    } satisfies MessageEnvelope

    expect(validateEnvelopeShape(envelope)).toBe(true)
    expect(deserializeEnvelope(serializeEnvelope(envelope))).toEqual(envelope)
  })

  it('rejects invalid JSON during deserialization', () => {
    expect(() => deserializeEnvelope('{not-json')).toThrow('Invalid RPC envelope JSON')
  })

  it('rejects envelopes missing required id or type fields', () => {
    expect(validateEnvelopeShape({ type: 'request', channel: 'sessions:getMessages' })).toBe(false)
    expect(validateEnvelopeShape({ id: 'request-1', channel: 'sessions:getMessages' })).toBe(false)
    expect(() =>
      deserializeEnvelope(JSON.stringify({ type: 'request', channel: 'sessions:getMessages' }))
    ).toThrow('Invalid RPC envelope shape')
  })

  it('rejects envelopes with unsupported message types or invalid args', () => {
    expect(validateEnvelopeShape({ id: 'request-1', type: 'unknown' })).toBe(false)
    expect(
      validateEnvelopeShape({
        id: 'request-1',
        type: 'request',
        channel: 'sessions:getMessages',
        args: 'not-array'
      })
    ).toBe(false)
  })

  it('rejects envelopes with invalid client capabilities', () => {
    expect(
      validateEnvelopeShape({
        id: 'handshake-1',
        type: 'handshake',
        clientCapabilities: [CLIENT_TEST_ECHO, 42]
      })
    ).toBe(false)
  })

  it('rejects wire errors with unknown error codes', () => {
    expect(
      validateEnvelopeShape({
        id: 'request-1',
        type: 'response',
        error: {
          code: 'AUTH_FAILED',
          message: 'nope'
        }
      })
    ).toBe(false)
    expect(() =>
      deserializeEnvelope(
        JSON.stringify({
          id: 'request-1',
          type: 'response',
          error: {
            code: 'AUTH_FAILED',
            message: 'nope'
          }
        })
      )
    ).toThrow('Invalid RPC envelope shape')
  })
})
