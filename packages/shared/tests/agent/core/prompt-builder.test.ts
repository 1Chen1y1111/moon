/**
 * 负责验证 agent prompt builder 的消息选择和 prompt 串行化规则。
 * 测试只覆盖纯数据转换，不触发 SDK、文件系统或权限流程。
 */

import { describe, expect, it } from 'vitest'

import { buildSessionContextBlock, PromptBuilder } from '../../../src/agent'

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

  it('prepends session context before serialized history when session context is available', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'fallback',
        messages: [{ role: 'user', content: 'inspect session' }],
        sessionContextBlock: '<session_state>\npermissionMode: ask\n</session_state>'
      })
    ).toBe('<session_state>\npermissionMode: ask\n</session_state>\n\nUSER:\ninspect session')
  })

  it('keeps session context before source context when both are available', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'fallback',
        messages: [{ role: 'user', content: 'inspect sources' }],
        sessionContextBlock: '<session_state>\npermissionMode: safe\n</session_state>',
        sourceContextBlock: '<sources>\nActive:\n- github (GitHub)\n</sources>'
      })
    ).toBe(`<session_state>
permissionMode: safe
</session_state>

<sources>
Active:
- github (GitHub)
</sources>

USER:
inspect sources`)
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

  it('ignores blank session context so fallback behavior stays unchanged', () => {
    const promptBuilder = new PromptBuilder()

    expect(
      promptBuilder.build({
        fallbackMessage: 'hello',
        messages: [],
        sessionContextBlock: '   '
      })
    ).toBe('hello')
  })

  it('omits activated sources when the session list is empty', () => {
    expect(
      buildSessionContextBlock({
        agentSessionState: {
          activatedSourceSlugs: [],
          permissionGrants: [],
          sourceGuideReads: []
        }
      })
    ).toBe(`<session_state>
permissionMode: ask
</session_state>`)
  })

  it('builds compact session context from permission mode and workspace state', () => {
    expect(
      buildSessionContextBlock({
        permissionMode: 'safe',
        workspace,
        agentSessionState: {
          activatedSourceSlugs: ['linear'],
          permissionGrants: [
            { type: 'bash', toolName: 'Bash', command: 'pnpm test' },
            { type: 'file_write', toolName: 'Edit', path: 'README.md' }
          ],
          sourceGuideReads: [
            {
              sourceSlug: 'linear',
              guidePath: '/workspace/moon/sources/linear/guide.md'
            }
          ]
        }
      })
    ).toBe(`<session_state>
permissionMode: safe
workspacePath: /workspace/moon
activatedSources:
- sourceSlug="linear"
permissionGrants:
- type="bash" toolName="Bash" command="pnpm test"
- type="file_write" toolName="Edit" path="README.md"
sourceGuideReads:
- sourceSlug="linear" guidePath="/workspace/moon/sources/linear/guide.md"
</session_state>`)
  })
})
