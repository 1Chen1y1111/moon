/**
 * 负责验证 Claude prompt 构造规则。
 * 测试只覆盖上下文消息到纯文本 prompt 的转换边界。
 */

import { describe, expect, it } from 'vitest'

import { buildClaudePrompt } from '../../../../src/agent/backend/claude/prompt'

describe('buildClaudePrompt', () => {
  it('returns the current message when there is no history', () => {
    expect(buildClaudePrompt([], 'hello')).toBe('hello')
  })

  it('serializes history messages with explicit role labels', () => {
    expect(
      buildClaudePrompt(
        [
          { role: 'system', content: 'follow project rules' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' }
        ],
        'fallback'
      )
    ).toBe('SYSTEM:\nfollow project rules\n\nUSER:\nhello\n\nASSISTANT:\nhi')
  })
})
