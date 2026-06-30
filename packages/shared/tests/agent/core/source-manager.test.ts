/**
 * 负责验证 agent runtime 共享的 source 状态管理骨架。
 * 测试只覆盖纯内存状态和 prompt context 串行化，不触发 MCP、文件系统或鉴权流程。
 */

import { describe, expect, it } from 'vitest'

import { SourceManager, type AgentSourceRecord } from '../../../src/agent'

describe('SourceManager', () => {
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

  it('stores source records and exposes them without mutable internal state', () => {
    const sourceManager = new SourceManager({ sources })
    const listedSources = sourceManager.listSources()

    listedSources[0] = { ...listedSources[0], name: 'Mutated GitHub' }

    expect(sourceManager.listSources()[0]).toMatchObject({
      slug: 'github',
      name: 'GitHub',
      status: 'active'
    })
  })

  it('upserts source records by slug', () => {
    const sourceManager = new SourceManager({
      sources: [sources[0]]
    })

    sourceManager.upsertSource({
      slug: 'github',
      name: 'GitHub',
      description: 'GitHub repository context',
      status: 'failed',
      error: 'MCP server failed'
    })

    expect(sourceManager.listSources()).toEqual([
      {
        slug: 'github',
        name: 'GitHub',
        description: 'GitHub repository context',
        status: 'failed',
        error: 'MCP server failed'
      }
    ])
  })

  it('updates known source status without creating unknown sources', () => {
    const sourceManager = new SourceManager({
      sources: [sources[0], sources[3]]
    })

    expect(sourceManager.markSourceFailed('github', 'MCP server failed')).toBe(true)
    expect(sourceManager.markSourceNeedsAuth('docs', 'missing token')).toBe(true)
    expect(sourceManager.markSourceInactive('missing')).toBe(false)

    expect(sourceManager.listSources()).toEqual([
      {
        slug: 'github',
        name: 'GitHub',
        description: 'GitHub repository context',
        status: 'failed',
        guidePath: 'sources/github/guide.md',
        instructions: 'Use GitHub issues as project planning context.',
        error: 'MCP server failed'
      },
      {
        slug: 'docs',
        name: 'Docs',
        description: 'Project docs',
        status: 'needs_auth',
        error: 'missing token'
      }
    ])
  })

  it('records newly activated sources and consumes them once', () => {
    const sourceManager = new SourceManager({
      sources: [sources[0], sources[3]]
    })

    expect(sourceManager.markSourceActive('github')).toBe(true)
    expect(sourceManager.markSourceActive('docs')).toBe(true)
    expect(sourceManager.markSourceActive('missing')).toBe(false)

    expect(sourceManager.consumeActivatedSources()).toEqual(['docs'])
    expect(sourceManager.consumeActivatedSources()).toEqual([])
  })

  it('clears turn-scoped activated sources without changing source status', () => {
    const sourceManager = new SourceManager({
      sources: [sources[3]]
    })

    sourceManager.markSourceActive('docs')
    sourceManager.clearActivatedSources()

    expect(sourceManager.consumeActivatedSources()).toEqual([])
    expect(sourceManager.listActiveSources()).toEqual([
      {
        slug: 'docs',
        name: 'Docs',
        description: 'Project docs',
        status: 'active'
      }
    ])
  })

  it('lists active sources separately from unavailable sources', () => {
    const sourceManager = new SourceManager({ sources })

    expect(sourceManager.listActiveSources()).toEqual([sources[0]])
  })

  it('detects known inactive MCP source tools that need activation', () => {
    const sourceManager = new SourceManager({ sources })

    expect(sourceManager.checkInactiveMcpSourceTool('mcp__docs__search')).toEqual({
      sourceSlug: 'docs',
      sourceExists: true
    })
    expect(sourceManager.checkInactiveMcpSourceTool('mcp__slack__list_channels')).toEqual({
      sourceSlug: 'slack',
      sourceExists: true
    })
    expect(sourceManager.checkInactiveMcpSourceTool('mcp__linear__createIssue')).toEqual({
      sourceSlug: 'linear',
      sourceExists: true
    })
  })

  it('does not intercept active MCP source tools', () => {
    const sourceManager = new SourceManager({ sources })

    expect(sourceManager.checkInactiveMcpSourceTool('mcp__github__list_issues')).toBeNull()
  })

  it('does not create source state for unknown MCP source tools', () => {
    const sourceManager = new SourceManager({ sources })

    expect(sourceManager.checkInactiveMcpSourceTool('mcp__missing__search')).toBeNull()
    expect(sourceManager.listSources()).toEqual(sources)
  })

  it('ignores non-MCP tool names for source activation checks', () => {
    const sourceManager = new SourceManager({ sources })

    expect(sourceManager.checkInactiveMcpSourceTool('Read')).toBeNull()
    expect(sourceManager.checkInactiveMcpSourceTool('mcp__docs')).toBeNull()
  })

  it('reflects runtime status changes in the prompt context block', () => {
    const sourceManager = new SourceManager({
      sources: [sources[0], sources[3]]
    })

    sourceManager.markSourceFailed('github', 'MCP server failed')
    sourceManager.markSourceActive('docs')

    expect(sourceManager.buildContextBlock()).toBe(`<sources>
Active:
- docs (Docs): Project docs

Failed:
- github (GitHub): GitHub repository context
  Guide: sources/github/guide.md
  Instructions:
Use GitHub issues as project planning context.
  Error: MCP server failed
</sources>`)
  })

  it('prunes activation records for sources removed by setSources', () => {
    const sourceManager = new SourceManager({
      sources: [sources[3]]
    })

    sourceManager.markSourceActive('docs')
    sourceManager.setSources([sources[0]])

    expect(sourceManager.consumeActivatedSources()).toEqual([])
    expect(sourceManager.listSources()).toEqual([sources[0]])
  })

  it('formats source state as a prompt context block', () => {
    const sourceManager = new SourceManager({ sources })

    expect(sourceManager.buildContextBlock()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
  Guide: sources/github/guide.md
  Instructions:
Use GitHub issues as project planning context.

Needs auth:
- slack (Slack): Slack workspace
  Error: missing token

Failed:
- linear (Linear): Linear issues
  Error: server failed

Inactive:
- docs (Docs): Project docs
</sources>`)
  })

  it('omits the prompt context block when no sources are registered', () => {
    const sourceManager = new SourceManager()

    expect(sourceManager.buildContextBlock()).toBe('')
  })
})
