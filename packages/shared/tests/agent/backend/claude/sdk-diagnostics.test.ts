/**
 * 负责验证 Claude SDK diagnostics 边界的错误补全和脱敏语义。
 * 测试只覆盖内部诊断 helper，不构造 ClaudeAgent 或真实 SDK 查询。
 */

import { describe, expect, it } from 'vitest'

import {
  ClaudeStderrBuffer,
  createClaudeRuntimeSummary,
  createClaudeSdkErrorMessage
} from '../../../../src/agent/backend/claude/sdk-diagnostics'

describe('ClaudeSdkDiagnostics', () => {
  it('uses stderr details when Claude SDK only reports unknown', () => {
    expect(
      createClaudeSdkErrorMessage({
        message: 'unknown',
        stderr: 'provider rejected request: invalid beta header'
      })
    ).toBe('Claude SDK failed: provider rejected request: invalid beta header')
  })

  it('adds runtime diagnostics to authentication failures', () => {
    const runtimeSummary =
      'runtime: model=deepseek-v4-flash, baseUrl=https://api.deepseek.com/anthropic, authEnv=ANTHROPIC_AUTH_TOKEN, claudeConfig=isolated'

    expect(
      createClaudeSdkErrorMessage({
        message: 'authentication_failed',
        runtimeSummary,
        stderr: ''
      })
    ).toBe(`Claude SDK authentication failed: authentication_failed (${runtimeSummary})`)
  })

  it('redacts the configured API key from stderr diagnostics', () => {
    expect(
      createClaudeSdkErrorMessage({
        apiKey: 'sk-test-key',
        message: 'unknown',
        stderr: 'provider rejected API key sk-test-key'
      })
    ).toBe('Claude SDK failed: provider rejected API key [redacted]')
  })

  it('keeps explicit Claude SDK errors instead of overriding them with stderr', () => {
    expect(
      createClaudeSdkErrorMessage({
        message: 'Rate limit exceeded',
        stderr: 'provider rejected request: invalid beta header'
      })
    ).toBe('Rate limit exceeded')
  })

  it('creates a runtime summary without credential values', () => {
    const options = {
      debugFile: '/tmp/claude-debug.log',
      env: {
        ANTHROPIC_AUTH_TOKEN: 'secret-token',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        CLAUDE_CONFIG_DIR: '/tmp/claude-config'
      },
      model: 'deepseek-v4-flash'
    } as Parameters<typeof createClaudeRuntimeSummary>[0]

    expect(createClaudeRuntimeSummary(options)).toBe(
      'runtime: model=deepseek-v4-flash, baseUrl=https://api.deepseek.com/anthropic, authEnv=ANTHROPIC_AUTH_TOKEN, claudeConfig=isolated, debugFile=/tmp/claude-debug.log'
    )
  })

  it('keeps only the short stderr buffer limit', () => {
    const buffer = new ClaudeStderrBuffer()

    buffer.append('a'.repeat(3990))
    buffer.append('b'.repeat(20))

    expect(buffer.read()).toHaveLength(4000)
    expect(buffer.read()).toBe(`${'a'.repeat(3980)}${'b'.repeat(20)}`)
  })
})
