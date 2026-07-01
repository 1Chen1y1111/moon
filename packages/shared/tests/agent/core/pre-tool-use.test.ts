/**
 * 负责验证 Moon Claude-first PreToolUse 管线的 provider 无关决策结果。
 * 测试只覆盖输入归一后的权限规则，不触发 Claude SDK hook 或 UI 审批。
 */

import { describe, expect, it } from 'vitest'

import {
  runPreToolUseChecks,
  type ClaudeToolUsePermissionInput,
  type PreToolUseCheckInput
} from '../../../src/agent'

const workspace = { path: '/workspace/moon' }

/**
 * 构造最小 Claude 工具输入，方便每个用例只声明关心的字段。
 */
function createToolUseInput(
  overrides: Partial<ClaudeToolUsePermissionInput> = {}
): ClaudeToolUsePermissionInput {
  return {
    toolName: 'Read',
    toolUseId: 'tool-1',
    toolInput: { file_path: 'README.md' },
    ...overrides
  }
}

/**
 * 以默认 workspace 和 ask 模式运行 PreToolUse 管线。
 */
function checkPreToolUse(overrides: Partial<PreToolUseCheckInput> = {}) {
  return runPreToolUseChecks({
    ...createToolUseInput(),
    permissionMode: 'ask',
    workspace,
    ...overrides
  })
}

describe('runPreToolUseChecks', () => {
  it.each([
    ['Read', { file_path: 'README.md' }],
    ['Glob', { pattern: '*.ts', path: 'src' }],
    ['Grep', { pattern: 'Moon', path: 'src' }],
    ['LS', { directory: 'src' }]
  ])('allows read-only tool %s inside the workspace', (toolName, toolInput) => {
    expect(checkPreToolUse({ toolName, toolInput })).toEqual({ type: 'allow' })
  })

  it('blocks read-only tools outside the workspace', () => {
    expect(
      checkPreToolUse({
        toolName: 'Read',
        toolInput: { file_path: '../secret.txt' }
      })
    ).toEqual({
      type: 'block',
      reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
    })
  })

  it('returns a permission prompt for Bash in ask mode', () => {
    expect(
      checkPreToolUse({
        toolName: 'Bash',
        toolUseId: 'bash-tool-1',
        toolInput: { command: 'pnpm test' }
      })
    ).toEqual({
      type: 'prompt',
      request: {
        requestId: 'perm-bash-tool-1',
        toolName: 'Bash',
        description: '需要在项目目录执行命令：pnpm test',
        command: 'pnpm test',
        type: 'bash'
      }
    })
  })

  it('prompts for write tools in ask mode', () => {
    expect(
      checkPreToolUse({
        toolName: 'Edit',
        toolUseId: 'edit-tool-1',
        toolInput: { file_path: 'README.md', old_string: 'old', new_string: 'new' }
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

  it('blocks write tools in safe mode', () => {
    expect(
      checkPreToolUse({
        permissionMode: 'safe',
        toolName: 'Write',
        toolInput: { file_path: 'generated.txt', content: 'hello' }
      })
    ).toEqual({
      type: 'block',
      reason: '安全模式禁止 Claude Code SDK 修改项目文件。'
    })
  })

  it('allows write tools in allow-all mode when the path stays inside workspace', () => {
    expect(
      checkPreToolUse({
        permissionMode: 'allow-all',
        toolName: 'MultiEdit',
        toolInput: { file_path: 'README.md', edits: [] }
      })
    ).toEqual({ type: 'allow' })
  })

  it('blocks write tools outside the workspace before permission mode is applied', () => {
    expect(
      checkPreToolUse({
        permissionMode: 'allow-all',
        toolName: 'Write',
        toolInput: { file_path: '../generated.txt', content: 'hello' }
      })
    ).toEqual({
      type: 'block',
      reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
    })
  })

  it('blocks unsupported tools', () => {
    expect(
      checkPreToolUse({
        toolName: 'NotebookEdit',
        toolInput: { notebook_path: 'analysis.ipynb' }
      })
    ).toEqual({
      type: 'block',
      reason:
        'Moon 当前阶段只允许 Claude Code SDK 只读工具、Bash 和文件写入审批，已阻止 NotebookEdit。'
    })
  })

  it('returns source activation needed before regular tool permission checks', () => {
    expect(
      checkPreToolUse({
        sourceActivation: {
          sourceSlug: 'linear',
          sourceExists: true
        },
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' }
      })
    ).toEqual({
      type: 'source_activation_needed',
      sourceSlug: 'linear',
      sourceExists: true
    })
  })
})
