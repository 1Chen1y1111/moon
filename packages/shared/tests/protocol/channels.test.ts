/**
 * 负责验证 Moon 内部 RPC 协议通道名的稳定性。
 * 这些值是后续 server-core transport adapter 的映射基础。
 */

import { describe, expect, it } from 'vitest'

import { RPC_CHANNELS } from '@moon/shared/protocol'

describe('RPC_CHANNELS.sessions', () => {
  it('keeps session RPC channel values stable', () => {
    expect(RPC_CHANNELS.sessions).toEqual({
      listSessions: 'sessions:listSessions',
      getMessages: 'sessions:getMessages',
      listTopics: 'sessions:listTopics',
      listThreads: 'sessions:listThreads',
      createSession: 'sessions:createSession',
      deleteSession: 'sessions:deleteSession',
      importAttachment: 'sessions:importAttachment',
      createMessageTurn: 'sessions:createMessageTurn',
      runOperation: 'sessions:runOperation',
      sendMessage: 'sessions:sendMessage',
      cancelOperation: 'sessions:cancelOperation',
      approveToolCall: 'sessions:approveToolCall',
      rejectToolCall: 'sessions:rejectToolCall',
      event: 'session:event'
    })
  })

  it('keeps the event channel separate from callable sessions channels', () => {
    const callableChannels = Object.values(RPC_CHANNELS.sessions).filter(
      (channel) => channel !== RPC_CHANNELS.sessions.event
    )

    expect(RPC_CHANNELS.sessions.event).toBe('session:event')
    expect(callableChannels.every((channel) => channel.startsWith('sessions:'))).toBe(true)
  })
})
