/**
 * 负责验证 Claude query runtime builder 的 SDK options、hooks 和 diagnostics 组装。
 * 测试不执行真实 Claude SDK query，只检查本轮 runtime 输入如何变成 SDK options。
 */

import type { HookInput, Options } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  createClaudeQueryRuntime,
  type ClaudeQueryRuntimeInput
} from '../../../../src/agent/backend/claude/query-runtime'
import { createClaudeRuntimeSummary } from '../../../../src/agent/backend/claude/sdk-diagnostics'

const workspace = { name: 'moon', path: '/workspace/moon' }

type ClaudePreToolUseHook = NonNullable<NonNullable<Options['hooks']>['PreToolUse']>[number][
  'hooks'
][number]

/**
 * 创建 query runtime 的默认输入，单个用例只覆盖自己关心的字段。
 */
function createRuntimeInput(
  overrides: Partial<ClaudeQueryRuntimeInput> = {}
): ClaudeQueryRuntimeInput {
  return {
    abortController: new AbortController(),
    checkToolUse: vi.fn(() => ({ type: 'allow' as const })),
    model: 'claude-sonnet',
    ...overrides
  }
}

/**
 * 创建 Claude SDK PreToolUse hook 输入，避免每个用例重复无关字段。
 */
function createPreToolUseInput(
  input: Pick<
    Extract<HookInput, { hook_event_name: 'PreToolUse' }>,
    'tool_name' | 'tool_input' | 'tool_use_id'
  >
): Extract<HookInput, { hook_event_name: 'PreToolUse' }> {
  return {
    hook_event_name: 'PreToolUse',
    session_id: 'sdk-session-1',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: workspace.path,
    ...input
  }
}

/**
 * 读取 query runtime 创建出的 PreToolUse hook callback。
 */
function resolvePreToolUseHook(hooks: Options['hooks']): ClaudePreToolUseHook {
  const hook = hooks?.PreToolUse?.[0]?.hooks[0]

  if (hook === undefined) {
    throw new Error('PreToolUse hook not found.')
  }

  return hook
}

/**
 * 按 Claude SDK hook callback 签名调用测试目标；后两个参数当前适配层不读取。
 */
function runPreToolUseHook(hook: ClaudePreToolUseHook, input: HookInput): Promise<unknown> {
  const args = [input, undefined, undefined] as unknown as Parameters<ClaudePreToolUseHook>

  return hook(...args)
}

describe('createClaudeQueryRuntime', () => {
  it('keeps no-workspace query options without PreToolUse hooks', () => {
    const abortController = new AbortController()
    const runtime = createClaudeQueryRuntime(
      createRuntimeInput({
        abortController
      })
    )

    expect(runtime.queryOptions).toMatchObject({
      abortController,
      includePartialMessages: true,
      model: 'claude-sonnet',
      permissionMode: 'dontAsk',
      tools: []
    })
    expect(runtime.queryOptions).not.toHaveProperty('hooks')
  })

  it('creates workspace Claude Code options with PreToolUse hooks', () => {
    const runtime = createClaudeQueryRuntime(
      createRuntimeInput({
        workspace
      })
    )

    expect(runtime.queryOptions).toMatchObject({
      allowDangerouslySkipPermissions: true,
      cwd: '/workspace/moon',
      includePartialMessages: true,
      model: 'claude-sonnet',
      permissionMode: 'bypassPermissions',
      tools: { type: 'preset', preset: 'claude_code' }
    })
    expect(runtime.queryOptions.disallowedTools).toContain('EnterPlanMode')
    expect(runtime.queryOptions.hooks?.PreToolUse).toHaveLength(1)
    expect(runtime.queryOptions.systemPrompt).toMatchObject({
      type: 'preset',
      preset: 'claude_code',
      append: expect.stringContaining('项目根目录：/workspace/moon')
    })
  })

  it('writes stderr callback data into the returned stderr buffer', () => {
    const runtime = createClaudeQueryRuntime(createRuntimeInput())

    runtime.queryOptions.stderr?.('first line')
    runtime.queryOptions.stderr?.('\nsecond line')

    expect(runtime.stderrBuffer.read()).toBe('first line\nsecond line')
  })

  it('creates runtime summary from the same query options', () => {
    const runtime = createClaudeQueryRuntime(
      createRuntimeInput({
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com',
        workspace
      })
    )

    expect(runtime.runtimeSummary).toBe(createClaudeRuntimeSummary(runtime.queryOptions))
    expect(runtime.runtimeSummary).toContain('model=claude-sonnet')
    expect(runtime.runtimeSummary).toContain('baseUrl=https://api.example.com')
  })

  it('forwards permission requests through the generated PreToolUse hook', async () => {
    const permissionRequest = {
      requestId: 'perm-bash-tool-1',
      toolName: 'Bash',
      description: '需要在项目目录执行命令：pwd',
      command: 'pwd',
      type: 'bash' as const
    }
    const checkToolUse = vi.fn(() => ({
      type: 'prompt' as const,
      request: permissionRequest
    }))
    const requestPermission = vi.fn(async () => ({
      requestId: 'perm-bash-tool-1',
      approved: true
    }))
    const runtime = createClaudeQueryRuntime(
      createRuntimeInput({
        checkToolUse,
        requestPermission,
        workspace
      })
    )
    const hook = resolvePreToolUseHook(runtime.queryOptions.hooks)

    await expect(
      runPreToolUseHook(
        hook,
        createPreToolUseInput({
          tool_name: 'Bash',
          tool_input: { command: 'pwd' },
          tool_use_id: 'bash-tool-1'
        })
      )
    ).resolves.toEqual({ continue: true })
    expect(checkToolUse).toHaveBeenCalledWith({
      toolName: 'Bash',
      toolInput: { command: 'pwd' },
      toolUseId: 'bash-tool-1'
    })
    expect(requestPermission).toHaveBeenCalledWith(permissionRequest)
  })

  it('forwards source activation requests through the generated PreToolUse hook', async () => {
    const checkToolUse = vi.fn(() => ({
      type: 'source_activation_needed' as const,
      sourceSlug: 'linear',
      sourceExists: true
    }))
    const onToolUseBlocked = vi.fn()
    const requestSourceActivation = vi.fn(async () => true)
    const runtime = createClaudeQueryRuntime(
      createRuntimeInput({
        checkToolUse,
        onToolUseBlocked,
        requestSourceActivation,
        workspace
      })
    )
    const hook = resolvePreToolUseHook(runtime.queryOptions.hooks)

    await expect(
      runPreToolUseHook(
        hook,
        createPreToolUseInput({
          tool_name: 'mcp__linear__createIssue',
          tool_input: { title: 'Bug' },
          tool_use_id: 'source-tool-1'
        })
      )
    ).resolves.toMatchObject({
      continue: false,
      decision: 'block',
      reason: expect.stringContaining('Source "linear" 已激活')
    })
    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(onToolUseBlocked).toHaveBeenCalledWith(
      {
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      },
      expect.stringContaining('Source "linear" 已激活')
    )
  })
})
