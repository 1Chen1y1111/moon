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

  it('lists active sources separately from unavailable sources', () => {
    const sourceManager = new SourceManager({ sources })

    expect(sourceManager.listActiveSources()).toEqual([sources[0]])
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
