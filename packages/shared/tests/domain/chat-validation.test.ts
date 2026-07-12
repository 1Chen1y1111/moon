import { describe, expect, it } from 'vitest'

import {
  activateChatThreadInputSchema,
  getChatMessagesInputSchema,
  sendChatMessageInputSchema
} from '@moon/shared/domain/chat-validation'

describe('chat input validation', () => {
  it('trims active thread ids and rejects empty values', () => {
    expect(activateChatThreadInputSchema.parse({ threadId: ' thread-1 ' })).toEqual({
      threadId: 'thread-1'
    })
    expect(() => activateChatThreadInputSchema.parse({ threadId: '   ' })).toThrow()
  })

  it('trims message input and rejects empty content', () => {
    expect(
      sendChatMessageInputSchema.parse({ sessionId: ' session-1 ', content: ' hello ' })
    ).toEqual({
      sessionId: 'session-1',
      content: 'hello'
    })
    expect(() => sendChatMessageInputSchema.parse({ content: '   ' })).toThrow()
  })

  it('accepts an explicit LLM connection id alongside legacy provider context', () => {
    expect(
      sendChatMessageInputSchema.parse({
        llmConnectionId: ' deepseek ',
        provider: 'deepseek',
        content: ' hello '
      })
    ).toEqual({
      llmConnectionId: 'deepseek',
      provider: 'deepseek',
      content: 'hello'
    })
  })

  it('accepts complete branch lineage and rejects ambiguous branch inputs', () => {
    expect(
      sendChatMessageInputSchema.parse({
        sessionId: ' session-1 ',
        parentThreadId: ' thread-parent ',
        sourceMessageId: ' message-source ',
        content: ' branch question '
      })
    ).toEqual({
      sessionId: 'session-1',
      parentThreadId: 'thread-parent',
      sourceMessageId: 'message-source',
      content: 'branch question'
    })

    expect(() =>
      sendChatMessageInputSchema.parse({
        sessionId: 'session-1',
        parentThreadId: 'thread-parent',
        content: 'missing source'
      })
    ).toThrow()
    expect(() =>
      sendChatMessageInputSchema.parse({
        parentThreadId: 'thread-parent',
        sourceMessageId: 'message-source',
        content: 'missing session'
      })
    ).toThrow()
    expect(() =>
      sendChatMessageInputSchema.parse({
        sessionId: 'session-1',
        threadId: 'thread-current',
        parentThreadId: 'thread-parent',
        sourceMessageId: 'message-source',
        content: 'ambiguous thread'
      })
    ).toThrow()
    expect(() =>
      sendChatMessageInputSchema.parse({
        sessionId: 'session-1',
        parentThreadId: 'thread-parent',
        sourceMessageId: 'message-source',
        provider: 'deepseek',
        content: 'ambiguous provider'
      })
    ).toThrow()
  })

  it('requires non-empty session ids for message loading', () => {
    expect(getChatMessagesInputSchema.parse({ sessionId: ' session-1 ' })).toEqual({
      sessionId: 'session-1'
    })
    expect(() => getChatMessagesInputSchema.parse({ sessionId: '   ' })).toThrow()
  })
})
