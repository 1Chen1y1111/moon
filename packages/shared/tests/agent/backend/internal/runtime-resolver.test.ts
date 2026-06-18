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
  runClaudePreToolUseChecks,
  resolveClaudeCodeExecutablePath,
  resolveClaudeThinkingTokenBudget,
  resolveClaudeRuntimeEnv
} from '../../../../src/agent/backend/internal/runtime-resolver'

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

describe('resolveClaudeCodeExecutablePath', () => {
  it('uses an existing explicit Claude Code executable path from env', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-claude-cli-'))
    const executablePath = join(directoryPath, 'claude-cli.js')

    try {
      writeFileSync(executablePath, '#!/usr/bin/env node\n')

      expect(
        resolveClaudeCodeExecutablePath({
          MOON_CLAUDE_CODE_EXECUTABLE: executablePath
        })
      ).toBe(executablePath)
    } finally {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it('prefers the installed native Claude Code executable when available', () => {
    const executablePath = resolveClaudeCodeExecutablePath()

    expect(basename(executablePath ?? '')).toBe(
      process.platform === 'win32' ? 'claude.exe' : 'claude'
    )
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
})

describe('runClaudePreToolUseChecks', () => {
  const workspace = { path: '/workspace/moon' }

  it('prompts for file writes in ask mode with path and risk metadata', () => {
    expect(
      runClaudePreToolUseChecks(
        workspace,
        {
          hook_event_name: 'PreToolUse',
          session_id: 'sdk-session-1',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: '/workspace/moon',
          tool_name: 'Edit',
          tool_input: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
          tool_use_id: 'edit-tool-1'
        },
        'ask'
      )
    ).toEqual({
      type: 'prompt',
      request: {
        requestId: 'perm-edit-tool-1',
        toolName: 'Edit',
        description: '需要修改项目文件：README.md',
        path: 'README.md',
        type: 'file_write',
        impact: '写操作会改变当前项目工作区文件。'
      }
    })
  })

  it('blocks file writes in safe mode', () => {
    expect(
      runClaudePreToolUseChecks(
        workspace,
        {
          hook_event_name: 'PreToolUse',
          session_id: 'sdk-session-1',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: '/workspace/moon',
          tool_name: 'Write',
          tool_input: { file_path: 'generated.txt', content: 'hello' },
          tool_use_id: 'write-tool-1'
        },
        'safe'
      )
    ).toMatchObject({
      type: 'block',
      reason: '安全模式禁止 Claude Code SDK 修改项目文件。'
    })
  })

  it('allows file writes in allow-all mode when the target stays inside workspace', () => {
    expect(
      runClaudePreToolUseChecks(
        workspace,
        {
          hook_event_name: 'PreToolUse',
          session_id: 'sdk-session-1',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: '/workspace/moon',
          tool_name: 'MultiEdit',
          tool_input: { file_path: 'README.md', edits: [] },
          tool_use_id: 'multi-edit-tool-1'
        },
        'allow-all'
      )
    ).toEqual({ type: 'allow' })
  })

  it('blocks file writes outside the workspace before permission mode is applied', () => {
    expect(
      runClaudePreToolUseChecks(
        workspace,
        {
          hook_event_name: 'PreToolUse',
          session_id: 'sdk-session-1',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: '/workspace/moon',
          tool_name: 'Edit',
          tool_input: { file_path: '../README.md', old_string: 'old', new_string: 'new' },
          tool_use_id: 'edit-tool-2'
        },
        'allow-all'
      )
    ).toMatchObject({
      type: 'block',
      reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
    })
  })
})
