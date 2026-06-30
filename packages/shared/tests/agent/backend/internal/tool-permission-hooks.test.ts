/**
 * 负责验证 Claude SDK PreToolUse hook 与 Moon 工具权限规则之间的适配。
 * 测试只覆盖 hook 输入输出翻译，不解析 Claude runtime 环境或可执行文件。
 */

import type { HookInput } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  createClaudePreToolUseHooks,
  type ClaudeToolUseChecker
} from '../../../../src/agent/backend/internal/tool-permission-hooks'
import { PermissionManager } from '../../../../src/agent'

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
  options: Parameters<typeof createClaudePreToolUseHooks>[0]
): ClaudePreToolUseHook {
  const hooks = createClaudePreToolUseHooks(options)
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

/**
 * 创建由 core PermissionManager 提供的工具权限 checker，模拟 BaseAgent 注入到 hook 的能力。
 */
function createPermissionChecker(
  permissionMode: 'ask' | 'safe' | 'allow-all' = 'ask'
): ClaudeToolUseChecker {
  const permissionManager = new PermissionManager({ workspace, permissionMode })

  return (input) => permissionManager.checkClaudeToolUse(input)
}

/**
 * 创建 source activation 结果 checker，模拟 BaseAgent 在 PermissionManager 前的 source 短路。
 */
function createSourceActivationChecker(sourceExists = true): ClaudeToolUseChecker {
  return () => ({
    type: 'source_activation_needed',
    sourceSlug: 'linear',
    sourceExists
  })
}

describe('ClaudeToolUseChecker with PermissionManager', () => {
  it('prompts for file writes in ask mode with path and risk metadata', () => {
    expect(
      createPermissionChecker('ask')({
        toolName: 'Edit',
        toolInput: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
        toolUseId: 'edit-tool-1'
      })
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
      createPermissionChecker('safe')({
        toolName: 'Write',
        toolInput: { file_path: 'generated.txt', content: 'hello' },
        toolUseId: 'write-tool-1'
      })
    ).toMatchObject({
      type: 'block',
      reason: '安全模式禁止 Claude Code SDK 修改项目文件。'
    })
  })

  it('allows file writes in allow-all mode when the target stays inside workspace', () => {
    expect(
      createPermissionChecker('allow-all')({
        toolName: 'MultiEdit',
        toolInput: { file_path: 'README.md', edits: [] },
        toolUseId: 'multi-edit-tool-1'
      })
    ).toEqual({ type: 'allow' })
  })

  it('blocks file writes outside the workspace before permission mode is applied', () => {
    expect(
      createPermissionChecker('allow-all')({
        toolName: 'Edit',
        toolInput: { file_path: '../README.md', old_string: 'old', new_string: 'new' },
        toolUseId: 'edit-tool-2'
      })
    ).toMatchObject({
      type: 'block',
      reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
    })
  })
})

describe('createClaudePreToolUseHooks', () => {
  it('continues allowed tool calls without asking for UI permission', async () => {
    const requestPermission = vi.fn()
    const hook = resolvePreToolUseHook({
      checkToolUse: createPermissionChecker('allow-all'),
      requestPermission
    })

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
    const onToolUseBlocked = vi.fn()
    const hook = resolvePreToolUseHook({
      checkToolUse: createPermissionChecker('safe'),
      onToolUseBlocked
    })

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
    expect(onToolUseBlocked).toHaveBeenCalledWith(
      {
        toolName: 'Write',
        toolInput: { file_path: 'README.md', content: 'hello' },
        toolUseId: 'write-tool-1'
      },
      '安全模式禁止 Claude Code SDK 修改项目文件。'
    )
  })

  it('uses the UI permission requester for prompt decisions', async () => {
    const requestPermission = vi.fn(async () => ({
      requestId: 'perm-edit-tool-1',
      approved: true
    }))
    const hook = resolvePreToolUseHook({
      checkToolUse: createPermissionChecker('ask'),
      requestPermission
    })

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
    const onToolUseBlocked = vi.fn()
    const requestPermission = vi.fn(async () => ({
      requestId: 'perm-edit-tool-1',
      approved: false,
      reason: 'No'
    }))
    const hook = resolvePreToolUseHook({
      checkToolUse: createPermissionChecker('ask'),
      onToolUseBlocked,
      requestPermission
    })

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
    expect(onToolUseBlocked).toHaveBeenCalledWith(
      {
        toolName: 'Edit',
        toolInput: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
        toolUseId: 'edit-tool-1'
      },
      'No'
    )
  })

  it('requests source activation and blocks the current tool when activation succeeds', async () => {
    const onToolUseBlocked = vi.fn()
    const requestSourceActivation = vi.fn(async () => true)
    const hook = resolvePreToolUseHook({
      checkToolUse: createSourceActivationChecker(),
      onToolUseBlocked,
      requestSourceActivation
    })

    const result = await runPreToolUseHook(
      hook,
      createPreToolUseInput({
        tool_name: 'mcp__linear__createIssue',
        tool_input: { title: 'Bug' },
        tool_use_id: 'source-tool-1'
      })
    )

    expect(result).toMatchObject({
      continue: false,
      decision: 'block',
      reason: expect.stringContaining('已激活')
    })
    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(onToolUseBlocked).toHaveBeenCalledWith(
      {
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      },
      expect.stringContaining('下一轮可用')
    )
  })

  it('blocks source activation checks when activation fails', async () => {
    const onToolUseBlocked = vi.fn()
    const requestSourceActivation = vi.fn(async () => false)
    const hook = resolvePreToolUseHook({
      checkToolUse: createSourceActivationChecker(),
      onToolUseBlocked,
      requestSourceActivation
    })

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
      reason: expect.stringContaining('激活失败')
    })
    expect(onToolUseBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'mcp__linear__createIssue' }),
      expect.stringContaining('激活失败')
    )
  })

  it('blocks source activation checks when no requester is available', async () => {
    const onToolUseBlocked = vi.fn()
    const hook = resolvePreToolUseHook({
      checkToolUse: createSourceActivationChecker(),
      onToolUseBlocked
    })

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
      reason: expect.stringContaining('没有可用的 source activation 回调')
    })
    expect(onToolUseBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'mcp__linear__createIssue' }),
      expect.stringContaining('没有可用的 source activation 回调')
    )
  })

  it('blocks source activation checks when the requester throws', async () => {
    const onToolUseBlocked = vi.fn()
    const requestSourceActivation = vi.fn(async () => {
      throw new Error('activation crashed')
    })
    const hook = resolvePreToolUseHook({
      checkToolUse: createSourceActivationChecker(),
      onToolUseBlocked,
      requestSourceActivation
    })

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
      reason: expect.stringContaining('activation crashed')
    })
    expect(onToolUseBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'mcp__linear__createIssue' }),
      expect.stringContaining('activation crashed')
    )
  })
})
