/**
 * 负责验证 backend internal runtime resolver 的 SDK options 组装规则。
 * 测试只覆盖进程环境和 Claude SDK options 边界，不触发真实 SDK 查询。
 */

import { describe, expect, it } from 'vitest'

import {
  createClaudeQueryOptions,
  resolveClaudeThinkingTokenBudget,
  resolveClaudeRuntimeEnv
} from '../../../../src/agent/backend/internal/runtime-resolver'

describe('resolveClaudeRuntimeEnv', () => {
  it('returns undefined when no runtime override is needed', () => {
    expect(resolveClaudeRuntimeEnv({ baseEnv: { EXISTING: '1' } })).toBeUndefined()
  })

  it('merges API key and base URL into the provided environment', () => {
    expect(
      resolveClaudeRuntimeEnv({
        apiKey: 'test-key',
        baseEnv: { EXISTING: '1' },
        baseUrl: 'https://api.example.com'
      })
    ).toEqual({
      EXISTING: '1',
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: 'https://api.example.com'
    })
  })
})

describe('resolveClaudeThinkingTokenBudget', () => {
  it('maps thinking levels to Claude SDK max thinking token budgets', () => {
    expect(resolveClaudeThinkingTokenBudget('low')).toBe(1024)
    expect(resolveClaudeThinkingTokenBudget('medium')).toBe(4096)
    expect(resolveClaudeThinkingTokenBudget('high')).toBe(8192)
    expect(resolveClaudeThinkingTokenBudget(undefined)).toBeUndefined()
  })
})

describe('createClaudeQueryOptions', () => {
  it('creates standard Claude SDK query options without env when credentials are omitted', () => {
    const abortController = new AbortController()

    expect(
      createClaudeQueryOptions({
        abortController,
        baseEnv: { EXISTING: '1' },
        model: 'claude-sonnet'
      })
    ).toEqual({
      abortController,
      includePartialMessages: true,
      model: 'claude-sonnet',
      permissionMode: 'dontAsk',
      tools: []
    })
  })

  it('includes max thinking tokens when thinking level is provided', () => {
    const abortController = new AbortController()

    expect(
      createClaudeQueryOptions({
        abortController,
        model: 'claude-sonnet',
        thinkingLevel: 'high'
      })
    ).toMatchObject({
      maxThinkingTokens: 8192
    })
  })

  it('includes resolved env when runtime overrides are present', () => {
    const abortController = new AbortController()

    expect(
      createClaudeQueryOptions({
        abortController,
        apiKey: 'test-key',
        baseEnv: { EXISTING: '1' },
        model: 'claude-sonnet'
      })
    ).toMatchObject({
      env: {
        EXISTING: '1',
        ANTHROPIC_API_KEY: 'test-key'
      }
    })
  })
})
