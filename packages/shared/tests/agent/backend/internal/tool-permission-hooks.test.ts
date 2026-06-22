/**
 * 负责验证 Claude SDK PreToolUse hook 与 Moon 工具权限规则之间的适配。
 * 测试只覆盖 hook 输入输出翻译，不解析 Claude runtime 环境或可执行文件。
 */

import type { HookInput } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  createClaudePreToolUseHooks,
  runClaudePreToolUseChecks
} from '../../../../src/agent/backend/internal/tool-permission-hooks'

const workspace = { path: '/workspace/moon' }
type ClaudePreToolUseHook = NonNullable<
  NonNullable<ReturnType<typeof createClaudePreToolUseHooks>>['PreToolUse']
>[number]['hooks'][number]

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
 * 读取 createClaudePreToolUseHooks 创建的单个 hook callback。
 */
function resolvePreToolUseHook(
  options: Parameters<typeof createClaudePreToolUseHooks>
): ClaudePreToolUseHook {
  const hooks = createClaudePreToolUseHooks(...options)
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

describe('runClaudePreToolUseChecks', () => {
  it('prompts for file writes in ask mode with path and risk metadata', () => {
    expect(
      runClaudePreToolUseChecks(
        workspace,
        createPreToolUseInput({
          tool_name: 'Edit',
          tool_input: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
          tool_use_id: 'edit-tool-1'
        }),
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
        createPreToolUseInput({
          tool_name: 'Write',
          tool_input: { file_path: 'generated.txt', content: 'hello' },
          tool_use_id: 'write-tool-1'
        }),
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
        createPreToolUseInput({
          tool_name: 'MultiEdit',
          tool_input: { file_path: 'README.md', edits: [] },
          tool_use_id: 'multi-edit-tool-1'
        }),
        'allow-all'
      )
    ).toEqual({ type: 'allow' })
  })

  it('blocks file writes outside the workspace before permission mode is applied', () => {
    expect(
      runClaudePreToolUseChecks(
        workspace,
        createPreToolUseInput({
          tool_name: 'Edit',
          tool_input: { file_path: '../README.md', old_string: 'old', new_string: 'new' },
          tool_use_id: 'edit-tool-2'
        }),
        'allow-all'
      )
    ).toMatchObject({
      type: 'block',
      reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
    })
  })
})

describe('createClaudePreToolUseHooks', () => {
  it('continues allowed tool calls without asking for UI permission', async () => {
    const requestPermission = vi.fn()
    const hook = resolvePreToolUseHook([workspace, requestPermission, 'allow-all'])

    await expect(
      runPreToolUseHook(
        hook,
        createPreToolUseInput({
          tool_name: 'Write',
          tool_input: { file_path: 'README.md', content: 'hello' },
          tool_use_id: 'write-tool-1'
        })
      )
    ).resolves.toEqual({ continue: true })
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('translates blocked permission checks into Claude SDK block output', async () => {
    const hook = resolvePreToolUseHook([workspace, undefined, 'safe'])

    await expect(
      runPreToolUseHook(
        hook,
        createPreToolUseInput({
          tool_name: 'Write',
          tool_input: { file_path: 'README.md', content: 'hello' },
          tool_use_id: 'write-tool-1'
        })
      )
    ).resolves.toMatchObject({
      continue: false,
      decision: 'block',
      reason: '安全模式禁止 Claude Code SDK 修改项目文件。'
    })
  })

  it('uses the UI permission requester for prompt decisions', async () => {
    const requestPermission = vi.fn(async () => ({
      requestId: 'perm-edit-tool-1',
      approved: true
    }))
    const hook = resolvePreToolUseHook([workspace, requestPermission, 'ask'])

    await expect(
      runPreToolUseHook(
        hook,
        createPreToolUseInput({
          tool_name: 'Edit',
          tool_input: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
          tool_use_id: 'edit-tool-1'
        })
      )
    ).resolves.toEqual({ continue: true })
    expect(requestPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'perm-edit-tool-1',
        toolName: 'Edit',
        path: 'README.md'
      })
    )
  })

  it('blocks prompt decisions when the UI requester denies permission', async () => {
    const requestPermission = vi.fn(async () => ({
      requestId: 'perm-edit-tool-1',
      approved: false,
      reason: 'No'
    }))
    const hook = resolvePreToolUseHook([workspace, requestPermission, 'ask'])

    await expect(
      runPreToolUseHook(
        hook,
        createPreToolUseInput({
          tool_name: 'Edit',
          tool_input: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
          tool_use_id: 'edit-tool-1'
        })
      )
    ).resolves.toEqual({
      continue: false,
      decision: 'block',
      reason: 'No'
    })
  })
})
