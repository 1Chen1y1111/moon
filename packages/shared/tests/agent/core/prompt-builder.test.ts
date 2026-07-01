/**
 * 负责验证 agent prompt builder 的消息选择和 prompt 串行化规则。
 * 测试只覆盖纯数据转换，不触发 SDK、文件系统或权限流程。
 */

import { describe, expect, it } from 'vitest'

import { PromptBuilder } from '../../../src/agent'

describe('PromptBuilder', () => {
  const workspace = { path: '/workspace/moon' }

  it('returns the fallback message when there are no prompt messages', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'hello',
        messages: []
      })
    ).toBe('hello')
  })

  it('serializes history messages with explicit role labels when no workspace is active', () => {
    const promptBuilder = new PromptBuilder()

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

  it('keeps assistant history when workspace context is active', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'fallback',
        messages: [
          { role: 'system', content: 'project context' },
          { role: 'user', content: 'previous question' },
          { role: 'assistant', content: 'previous answer' },
          { role: 'user', content: 'current question' }
        ],
        workspace
      })
    ).toBe('USER:\nprevious question\n\nASSISTANT:\nprevious answer\n\nUSER:\ncurrent question')
  })

  it('filters system messages when workspace context is active', () => {
    const promptBuilder = new PromptBuilder()

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
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'inspect project',
        messages: [{ role: 'system', content: 'project context' }],
        workspace
      })
    ).toBe('inspect project')
  })

  it('prepends source context before serialized history when source context is available', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'fallback',
        messages: [{ role: 'user', content: 'inspect sources' }],
        sourceContextBlock: '<sources>\nActive:\n- github (GitHub)\n</sources>'
      })
    ).toBe('<sources>\nActive:\n- github (GitHub)\n</sources>\n\nUSER:\ninspect sources')
  })

  it('prepends source context before workspace-filtered history', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'fallback',
        messages: [
          { role: 'system', content: 'project context' },
          { role: 'user', content: 'inspect workspace' }
        ],
        sourceContextBlock: '<sources>\nActive:\n- workspace (Workspace)\n</sources>',
        workspace
      })
    ).toBe('<sources>\nActive:\n- workspace (Workspace)\n</sources>\n\nUSER:\ninspect workspace')
  })

  it('prepends source context before fallback messages when history is empty', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'current question',
        messages: [],
        sourceContextBlock: '<sources>\nActive:\n- workspace (Workspace)\n</sources>',
        workspace
      })
    ).toBe('<sources>\nActive:\n- workspace (Workspace)\n</sources>\n\ncurrent question')
  })

  it('ignores blank source context so fallback behavior stays unchanged', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'hello',
        messages: [],
        sourceContextBlock: '   '
      })
    ).toBe('hello')
  })
})
