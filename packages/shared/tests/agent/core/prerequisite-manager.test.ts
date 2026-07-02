/**
 * 负责验证 Claude-first 最小 prerequisite 管线。
 * 测试只覆盖 source guide 已读状态，不触发 MCP、文件系统或 Claude SDK。
 */

import { describe, expect, it } from 'vitest'

import {
  createAgentSessionRuntimeState,
  PrerequisiteManager,
  type AgentSourceRecord
} from '../../../src/agent'

const workspace = { path: '/workspace/moon' }

const activeSources: AgentSourceRecord[] = [
  {
    slug: 'github',
    name: 'GitHub',
    description: 'GitHub issues',
    guidePath: 'sources/github/guide.md',
    status: 'active'
  }
]

/**
 * 创建带默认 workspace 和空 session state 的 prerequisite manager。
 */
function createManager() {
  const agentSessionState = createAgentSessionRuntimeState()
  const manager = new PrerequisiteManager({ agentSessionState, workspace })

  return { agentSessionState, manager }
}

describe('PrerequisiteManager', () => {
  it('blocks active source tools until their guide has been read', () => {
    const { manager } = createManager()

    expect(
      manager.checkClaudeToolUse(
        {
          toolName: 'mcp__github__list_issues',
          toolInput: {},
          toolUseId: 'source-tool-1'
        },
        activeSources
      )
    ).toEqual({
      type: 'block',
      reason:
        '使用 source "github" 的工具前，必须先用 Read 读取 source guide：sources/github/guide.md。'
    })
  })

  it('records Read.file_path when it matches an active source guide', () => {
    const { agentSessionState, manager } = createManager()

    manager.trackClaudeToolUse(
      {
        toolName: 'Read',
        toolInput: { file_path: 'sources/github/guide.md' },
        toolUseId: 'read-tool-1'
      },
      activeSources
    )

    expect(agentSessionState.sourceGuideReads).toEqual([
      {
        sourceSlug: 'github',
        guidePath: '/workspace/moon/sources/github/guide.md'
      }
    ])
  })

  it('allows active source tools after their guide has been read', () => {
    const { manager } = createManager()

    manager.trackClaudeToolUse(
      {
        toolName: 'Read',
        toolInput: { file_path: '/workspace/moon/sources/github/guide.md' },
        toolUseId: 'read-tool-1'
      },
      activeSources
    )

    expect(
      manager.checkClaudeToolUse(
        {
          toolName: 'mcp__github__list_issues',
          toolInput: {},
          toolUseId: 'source-tool-1'
        },
        activeSources
      )
    ).toEqual({ type: 'allow' })
  })

  it('does not handle inactive source tools because source activation owns that path', () => {
    const { manager } = createManager()

    expect(
      manager.checkClaudeToolUse(
        {
          toolName: 'mcp__docs__search',
          toolInput: {},
          toolUseId: 'source-tool-1'
        },
        [
          {
            slug: 'docs',
            name: 'Docs',
            guidePath: 'sources/docs/guide.md',
            status: 'inactive'
          }
        ]
      )
    ).toEqual({ type: 'allow' })
  })
})
