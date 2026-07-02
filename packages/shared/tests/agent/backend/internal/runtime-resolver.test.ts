/**
 * 负责验证 backend internal runtime resolver 的 SDK options 组装规则。
 * 测试只覆盖进程环境和 Claude SDK options 边界，不触发真实 SDK 查询。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createClaudeQueryOptions,
  resolveBackendContext,
  resolveClaudeThinkingTokenBudget,
  resolveClaudeRuntimeEnv
} from '../../../../src/agent/backend/internal/runtime-resolver'
import { anthropicDriver } from '../../../../src/agent/backend/internal/drivers/anthropic'

const sourceRecords = [
  {
    slug: 'github',
    name: 'GitHub',
    description: 'GitHub repository context',
    status: 'active' as const
  }
]

describe('resolveClaudeRuntimeEnv', () => {
  it('returns undefined when no runtime override is needed', () => {
    expect(resolveClaudeRuntimeEnv({ baseEnv: { EXISTING: '1' } })).toBeUndefined()
  })

  it('uses isolated Claude Code auth env for custom Claude-compatible endpoints', () => {
    expect(
      resolveClaudeRuntimeEnv({
        apiKey: 'test-key',
        baseEnv: { EXISTING: '1' },
        baseUrl: 'https://api.example.com',
        model: 'deepseek-chat'
      })
    ).toEqual({
      EXISTING: '1',
      ANTHROPIC_AUTH_TOKEN: 'test-key',
      ANTHROPIC_BASE_URL: 'https://api.example.com',
      ANTHROPIC_MODEL: 'deepseek-chat',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-chat',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-chat',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-chat',
      CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-chat',
      CLAUDE_CODE_EFFORT_LEVEL: 'max',
      CLAUDE_CONFIG_DIR: expect.any(String)
    })
  })

  it('keeps official Anthropic API key auth unchanged without custom base URL', () => {
    expect(
      resolveClaudeRuntimeEnv({
        apiKey: 'test-key',
        baseEnv: { EXISTING: '1' }
      })
    ).toEqual({
      EXISTING: '1',
      ANTHROPIC_API_KEY: 'test-key'
    })
  })

  it('removes stale managed Claude env before injecting current credentials', () => {
    const env = resolveClaudeRuntimeEnv({
      apiKey: 'fresh-key',
      baseEnv: {
        EXISTING: '1',
        ANTHROPIC_API_KEY: 'stale-api-key',
        ANTHROPIC_AUTH_TOKEN: 'stale-auth-token',
        ANTHROPIC_BASE_URL: 'https://stale.example.com',
        CLAUDE_CONFIG_DIR: '/tmp/stale-claude-config',
        CLAUDE_CODE_OAUTH_TOKEN: 'stale-oauth-token'
      },
      baseUrl: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-v4-flash'
    })

    expect(env).toMatchObject({
      EXISTING: '1',
      ANTHROPIC_AUTH_TOKEN: 'fresh-key',
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_MODEL: 'deepseek-v4-flash',
      CLAUDE_CODE_EFFORT_LEVEL: 'max',
      CLAUDE_CONFIG_DIR: expect.any(String)
    })
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(env?.CLAUDE_CONFIG_DIR).not.toBe('/tmp/stale-claude-config')
    expect(env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
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

describe('resolveBackendContext', () => {
  it('combines provider runtime fields with shared backend runtime config', () => {
    const agentSessionState = {
      permissionGrants: [{ type: 'bash' as const, toolName: 'Bash', command: 'pnpm test' }],
      sourceGuideReads: []
    }
    const config = {
      agentSessionState,
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
      messages: [{ role: 'user' as const, content: 'hello' }],
      permissionMode: 'ask' as const,
      sources: sourceRecords,
      thinkingLevel: 'high' as const,
      workspace: { name: 'moon', path: '/workspace/moon' }
    }

    expect(resolveBackendContext(config, anthropicDriver.resolve(config))).toEqual({
      agentSessionState,
      provider: 'anthropic',
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
      messages: [{ role: 'user', content: 'hello' }],
      model: 'claude-sonnet-4-5',
      permissionMode: 'ask',
      sources: sourceRecords,
      thinkingLevel: 'high',
      workspace: { name: 'moon', path: '/workspace/moon' }
    })
  })

  it('defaults messages to an empty array for backend construction', () => {
    const config = {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-5'
    }

    expect(resolveBackendContext(config, anthropicDriver.resolve(config))).toMatchObject({
      provider: 'anthropic',
      messages: [],
      model: 'claude-sonnet-4-5'
    })
  })
})

describe('createClaudeQueryOptions', () => {
  it('creates standard Claude SDK query options without env when credentials are omitted', () => {
    const abortController = new AbortController()
    const options = createClaudeQueryOptions({
      abortController,
      baseEnv: { EXISTING: '1' },
      model: 'claude-sonnet'
    })

    expect(options).toMatchObject({
      abortController,
      includePartialMessages: true,
      model: 'claude-sonnet',
      permissionMode: 'dontAsk',
      tools: []
    })
    expect(basename(options.pathToClaudeCodeExecutable ?? '')).toBe(
      process.platform === 'win32' ? 'claude.exe' : 'claude'
    )
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

  it('uses Claude Code auth env for custom Claude-compatible endpoints', () => {
    const abortController = new AbortController()

    const options = createClaudeQueryOptions({
      abortController,
      apiKey: 'test-key',
      baseEnv: { EXISTING: '1' },
      baseUrl: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-chat'
    })

    expect(options).toMatchObject({
      debugFile: expect.any(String),
      env: {
        EXISTING: '1',
        ANTHROPIC_AUTH_TOKEN: 'test-key',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        ANTHROPIC_MODEL: 'deepseek-chat',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-chat',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-chat',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-chat',
        CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-chat',
        CLAUDE_CODE_EFFORT_LEVEL: 'max',
        CLAUDE_CONFIG_DIR: expect.any(String)
      }
    })
    expect(options.debugFile).toContain('debug.log')
    expect(options).not.toHaveProperty('maxThinkingTokens')
  })

  it('passes the resolved Claude Code executable path to the SDK options', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-claude-cli-'))
    const executablePath = join(directoryPath, 'claude-cli.js')

    try {
      writeFileSync(executablePath, '#!/usr/bin/env node\n')

      expect(
        createClaudeQueryOptions({
          abortController: new AbortController(),
          baseEnv: { MOON_CLAUDE_CODE_EXECUTABLE: executablePath },
          model: 'claude-sonnet'
        })
      ).toMatchObject({
        pathToClaudeCodeExecutable: executablePath
      })
    } finally {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it('passes stderr callback through to Claude SDK options', () => {
    const stderr = (): void => undefined

    expect(
      createClaudeQueryOptions({
        abortController: new AbortController(),
        model: 'claude-sonnet',
        stderr
      })
    ).toMatchObject({ stderr })
  })

  it('configures Claude Code workspace preset and hooks when workspace options are active', () => {
    const hooks = {
      PreToolUse: [{ hooks: [async (): Promise<{ continue: true }> => ({ continue: true })] }]
    }

    expect(
      createClaudeQueryOptions({
        abortController: new AbortController(),
        hooks,
        model: 'claude-sonnet',
        workspace: { name: 'moon', path: '/workspace/moon' }
      })
    ).toMatchObject({
      allowDangerouslySkipPermissions: true,
      cwd: '/workspace/moon',
      disallowedTools: ['EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion', 'Skill'],
      hooks,
      permissionMode: 'bypassPermissions',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: expect.stringContaining('项目根目录：/workspace/moon')
      },
      tools: { type: 'preset', preset: 'claude_code' }
    })
  })
})
