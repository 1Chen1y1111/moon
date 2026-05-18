import { describe, expect, it } from 'vitest'

import {
  getChatMessagesInputSchema,
  sendChatMessageInputSchema
} from '@moon/shared/domain/chat-validation'

describe('chat input validation', () => {
  it('trims message input and rejects empty content', () => {
    expect(
      sendChatMessageInputSchema.parse({ sessionId: ' session-1 ', content: ' hello ' })
    ).toEqual({
      sessionId: 'session-1',
      content: 'hello'
    })
    expect(() => sendChatMessageInputSchema.parse({ content: '   ' })).toThrow()
  })

  it('requires non-empty session ids for message loading', () => {
    expect(getChatMessagesInputSchema.parse({ sessionId: ' session-1 ' })).toEqual({
      sessionId: 'session-1'
    })
    expect(() => getChatMessagesInputSchema.parse({ sessionId: '   ' })).toThrow()
  })
})
