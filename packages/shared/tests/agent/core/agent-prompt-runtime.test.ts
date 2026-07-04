/**
 * 负责验证 AgentPromptRuntime 的 prompt 运行态编排。
 * 测试只覆盖 session/source context 与 PromptBuilder 的组合，不触发 SDK 或权限流程。
 */

import { describe, expect, it } from 'vitest'

import { AgentPromptRuntime } from '../../../src/agent/core/agent-prompt-runtime'
import { createAgentSessionRuntimeState } from '../../../src/agent/core/session-runtime-state'
import { SourceManager } from '../../../src/agent/core/source-manager'

describe('AgentPromptRuntime', () => {
  const workspace = { path: '/workspace/moon' }

  it('places session context before source context and serialized messages', () => {
    const sourceManager = new SourceManager({
      sources: [
        {
          slug: 'github',
          name: 'GitHub',
          description: 'GitHub issues',
          status: 'active'
        }
      ]
    })
    const runtime = new AgentPromptRuntime({
      agentSessionState: createAgentSessionRuntimeState(),
      permissionMode: 'safe',
      sourceManager
    })

    expect(
      runtime.build({
        fallbackMessage: 'fallback',
        messages: [{ role: 'user', content: 'inspect sources' }]
      })
    ).toBe(`<session_state>
permissionMode: safe
</session_state>

<sources>
Active:
- github (GitHub): GitHub issues
</sources>

USER:
inspect sources`)
  })

  it('keeps workspace message filtering behavior', () => {
    const runtime = new AgentPromptRuntime({
      agentSessionState: createAgentSessionRuntimeState(),
      sourceManager: new SourceManager(),
      workspace
    })

    expect(
      runtime.build({
        fallbackMessage: 'fallback',
        messages: [
          { role: 'system', content: 'project context' },
          { role: 'user', content: 'previous question' },
          { role: 'assistant', content: 'previous answer' }
        ]
      })
    ).toBe(`<session_state>
permissionMode: ask
workspacePath: /workspace/moon
</session_state>

USER:
previous question

ASSISTANT:
previous answer`)
  })

  it('uses the fallback message when workspace filtering removes history', () => {
    const runtime = new AgentPromptRuntime({
      agentSessionState: createAgentSessionRuntimeState(),
      sourceManager: new SourceManager(),
      workspace
    })

    expect(
      runtime.build({
        fallbackMessage: 'inspect workspace',
        messages: [{ role: 'system', content: 'project context' }]
      })
    ).toBe(`<session_state>
permissionMode: ask
workspacePath: /workspace/moon
</session_state>

inspect workspace`)
  })

  it('includes session permission grants, activated sources and guide reads', () => {
    const agentSessionState = createAgentSessionRuntimeState()
    const runtime = new AgentPromptRuntime({
      agentSessionState,
      permissionMode: 'allow-all',
      sourceManager: new SourceManager(),
      workspace
    })

    agentSessionState.activatedSourceSlugs.push('linear')
    agentSessionState.permissionGrants.push({
      type: 'bash',
      toolName: 'Bash',
      command: 'pnpm test'
    })
    agentSessionState.sourceGuideReads.push({
      sourceSlug: 'linear',
      guidePath: '/workspace/moon/sources/linear/guide.md'
    })

    expect(
      runtime.build({
        fallbackMessage: 'fallback',
        messages: [{ role: 'user', content: 'inspect session' }]
      })
    ).toBe(`<session_state>
permissionMode: allow-all
workspacePath: /workspace/moon
activatedSources:
- sourceSlug="linear"
permissionGrants:
- type="bash" toolName="Bash" command="pnpm test"
sourceGuideReads:
- sourceSlug="linear" guidePath="/workspace/moon/sources/linear/guide.md"
</session_state>

USER:
inspect session`)
  })

  it('reads the latest source state when building prompts', () => {
    const sourceManager = new SourceManager({
      sources: [
        {
          slug: 'github',
          name: 'GitHub',
          description: 'GitHub issues',
          status: 'inactive'
        }
      ]
    })
    const runtime = new AgentPromptRuntime({
      agentSessionState: createAgentSessionRuntimeState(),
      sourceManager
    })

    expect(
      runtime.build({
        fallbackMessage: 'fallback',
        messages: [{ role: 'user', content: 'first prompt' }]
      })
    ).toContain(`Inactive:
- github (GitHub): GitHub issues`)

    sourceManager.markSourceActive('github')

    expect(
      runtime.build({
        fallbackMessage: 'fallback',
        messages: [{ role: 'user', content: 'second prompt' }]
      })
    ).toContain(`Active:
- github (GitHub): GitHub issues`)
  })
})
