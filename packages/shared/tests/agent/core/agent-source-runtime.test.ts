/**
 * 负责验证 AgentSourceRuntime 对 SourceManager 的 backend façade 语义。
 * 测试只覆盖 source 运行态边界，不接入 prompt、PreToolUse、Claude SDK 或真实 MCP。
 */

import { describe, expect, it } from 'vitest'

import { AgentSourceRuntime } from '../../../src/agent/core/agent-source-runtime'
import { SourceManager, type AgentSourceRecord } from '../../../src/agent'

describe('AgentSourceRuntime', () => {
  const sources: AgentSourceRecord[] = [
    {
      slug: 'github',
      name: 'GitHub',
      description: 'GitHub repository context',
      status: 'active',
      guidePath: 'sources/github/guide.md',
      instructions: 'Use GitHub issues as project planning context.'
    },
    {
      slug: 'slack',
      name: 'Slack',
      description: 'Slack workspace',
      status: 'needs_auth',
      error: 'missing token'
    },
    {
      slug: 'linear',
      name: 'Linear',
      description: 'Linear issues',
      status: 'failed',
      error: 'server failed'
    },
    {
      slug: 'docs',
      name: 'Docs',
      description: 'Project docs',
      status: 'inactive'
    }
  ]

  it('builds the same source context block as SourceManager', () => {
    const sourceRuntime = new AgentSourceRuntime({ sources })
    const sourceManager = new SourceManager({ sources })

    expect(sourceRuntime.buildContextBlock()).toBe(sourceManager.buildContextBlock())
  })

  it('keeps source status updates and activation consume semantics', () => {
    const sourceRuntime = new AgentSourceRuntime({ sources: [sources[3]] })

    expect(sourceRuntime.markSourceActive('docs')).toBe(true)
    expect(sourceRuntime.markSourceActive('missing')).toBe(false)
    expect(sourceRuntime.consumeActivatedSources()).toEqual(['docs'])
    expect(sourceRuntime.consumeActivatedSources()).toEqual([])

    expect(sourceRuntime.markSourceFailed('docs', 'MCP server failed')).toBe(true)
    expect(sourceRuntime.listSources()).toEqual([
      {
        slug: 'docs',
        name: 'Docs',
        description: 'Project docs',
        status: 'failed',
        error: 'MCP server failed'
      }
    ])

    expect(sourceRuntime.markSourceActive('docs')).toBe(true)
    sourceRuntime.clearActivatedSources()

    expect(sourceRuntime.consumeActivatedSources()).toEqual([])
    expect(sourceRuntime.listActiveSources()).toEqual([
      {
        slug: 'docs',
        name: 'Docs',
        description: 'Project docs',
        status: 'active'
      }
    ])
  })

  it('detects known and inactive MCP source tools through the runtime boundary', () => {
    const sourceRuntime = new AgentSourceRuntime({ sources })

    expect(sourceRuntime.checkKnownMcpSourceTool('mcp__github__list_issues')).toEqual({
      sourceSlug: 'github',
      sourceExists: true
    })
    expect(sourceRuntime.checkKnownMcpSourceTool('mcp__docs__search')).toEqual({
      sourceSlug: 'docs',
      sourceExists: true
    })
    expect(sourceRuntime.checkInactiveMcpSourceTool('mcp__docs__search')).toEqual({
      sourceSlug: 'docs',
      sourceExists: true
    })
    expect(sourceRuntime.checkInactiveMcpSourceTool('mcp__slack__list_channels')).toEqual({
      sourceSlug: 'slack',
      sourceExists: true
    })
    expect(sourceRuntime.checkInactiveMcpSourceTool('mcp__linear__createIssue')).toEqual({
      sourceSlug: 'linear',
      sourceExists: true
    })
    expect(sourceRuntime.checkInactiveMcpSourceTool('mcp__github__list_issues')).toBeNull()
  })

  it('detects inactive source tool_result errors without handling active or unknown sources', () => {
    const sourceRuntime = new AgentSourceRuntime({ sources })

    expect(
      sourceRuntime.detectInactiveSourceToolError(
        'mcp__docs__search',
        'No such tool available: mcp__docs__search</tool_use_error>'
      )
    ).toEqual({
      sourceSlug: 'docs',
      toolName: 'mcp__docs__search'
    })
    expect(
      sourceRuntime.detectInactiveSourceToolError(
        'mcp__github__list_issues',
        'No such tool available: mcp__github__list_issues'
      )
    ).toBeNull()
    expect(
      sourceRuntime.detectInactiveSourceToolError(
        'mcp__missing__search',
        'No such tool available: mcp__missing__search'
      )
    ).toBeNull()
  })

  it('does not create or misclassify unknown sources', () => {
    const sourceRuntime = new AgentSourceRuntime({ sources: [sources[3]] })

    expect(sourceRuntime.markSourceInactive('missing')).toBe(false)
    expect(sourceRuntime.checkKnownMcpSourceTool('mcp__missing__search')).toBeNull()
    expect(sourceRuntime.checkInactiveMcpSourceTool('mcp__missing__search')).toBeNull()
    expect(
      sourceRuntime.detectInactiveSourceToolError(
        'mcp__missing__search',
        'No such tool available: mcp__missing__search'
      )
    ).toBeNull()
    expect(sourceRuntime.listSources()).toEqual([sources[3]])
  })
})
