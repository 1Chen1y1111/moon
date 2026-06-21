/**
 * 负责验证 agent prompt builder 的消息选择和 prompt 串行化规则。
 * 测试只覆盖纯数据转换，不触发 SDK、文件系统或权限流程。
 */

import { describe, expect, it } from 'vitest'

import { AgentPromptBuilder } from '../../../src/agent'

describe('AgentPromptBuilder', () => {
  const workspace = { path: '/workspace/moon' }

  it('returns the fallback message when there are no prompt messages', () => {
    const promptBuilder = new AgentPromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'hello',
        messages: []
      })
    ).toBe('hello')
  })

  it('serializes history messages with explicit role labels when no workspace is active', () => {
    const promptBuilder = new AgentPromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'fallback',
        messages: [
          { role: 'system', content: 'follow project rules' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' }
        ]
      })
    ).toBe('SYSTEM:\nfollow project rules\n\nUSER:\nhello\n\nASSISTANT:\nhi')
  })

  it('filters system messages when workspace context is active', () => {
    const promptBuilder = new AgentPromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'fallback',
        messages: [
          { role: 'system', content: 'project context' },
          { role: 'user', content: 'previous question' }
        ],
        workspace
      })
    ).toBe('USER:\nprevious question')
  })

  it('returns the fallback message when workspace filtering removes every history message', () => {
    const promptBuilder = new AgentPromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'inspect project',
        messages: [{ role: 'system', content: 'project context' }],
        workspace
      })
    ).toBe('inspect project')
  })
})
