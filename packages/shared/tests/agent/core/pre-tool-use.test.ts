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
const sourceToolPolicyBlockReason =
  'Moon 已识别 source "linear" 的工具 mcp__linear__createIssue，但当前阶段尚未接入 source tool execution，已阻止该工具调用。'

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

  it('returns modify for Read workspace-relative paths with dot segments', () => {
    expect(
      checkPreToolUse({
        toolName: 'Read',
        toolInput: { file_path: './src/../README.md' }
      })
    ).toEqual({
      type: 'modify',
      toolInput: { file_path: 'README.md' }
    })
  })

  it.each([
    ['Glob', { pattern: '*.ts', path: './src/../src' }, { pattern: '*.ts', path: 'src' }],
    ['Grep', { pattern: 'Moon', path: './src/../src' }, { pattern: 'Moon', path: 'src' }],
    ['LS', { directory: './src/../src' }, { directory: 'src' }]
  ])('returns modify for read-only tool %s relative path dot segments', (
    toolName,
    toolInput,
    expectedToolInput
  ) => {
    expect(checkPreToolUse({ toolName, toolInput })).toEqual({
      type: 'modify',
      toolInput: expectedToolInput
    })
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

  it('does not return modify for Bash commands', () => {
    expect(
      checkPreToolUse({
        toolName: 'Bash',
        toolUseId: 'bash-tool-1',
        toolInput: { command: 'cat ./src/../README.md' }
      })
    ).toMatchObject({
      type: 'prompt',
      request: {
        command: 'cat ./src/../README.md'
      }
    })
  })

  it('allows Bash when a session permission grant matches the command', () => {
    expect(
      checkPreToolUse({
        permissionGrants: [{ type: 'bash', toolName: 'Bash', command: 'pnpm test' }],
        toolName: 'Bash',
        toolInput: { command: 'pnpm test' }
      })
    ).toEqual({ type: 'allow' })
  })

  it('keeps prompting Bash when the session permission grant command differs', () => {
    expect(
      checkPreToolUse({
        permissionGrants: [{ type: 'bash', toolName: 'Bash', command: 'pnpm test' }],
        toolName: 'Bash',
        toolUseId: 'bash-tool-2',
        toolInput: { command: 'pnpm typecheck' }
      })
    ).toMatchObject({
      type: 'prompt',
      request: {
        requestId: 'perm-bash-tool-2',
        command: 'pnpm typecheck'
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

  it('does not return modify for write tool paths before prompting', () => {
    expect(
      checkPreToolUse({
        toolName: 'Edit',
        toolUseId: 'edit-tool-1',
        toolInput: { file_path: './README.md', old_string: 'old', new_string: 'new' }
      })
    ).toMatchObject({
      type: 'prompt',
      request: {
        path: './README.md'
      }
    })
  })

  it('allows write tools when a session permission grant matches the path', () => {
    expect(
      checkPreToolUse({
        permissionGrants: [{ type: 'file_write', toolName: 'Edit', path: 'README.md' }],
        toolName: 'Edit',
        toolInput: { file_path: 'README.md', old_string: 'old', new_string: 'new' }
      })
    ).toEqual({ type: 'allow' })
  })

  it('keeps prompting write tools when the session permission grant path differs', () => {
    expect(
      checkPreToolUse({
        permissionGrants: [{ type: 'file_write', toolName: 'Edit', path: 'README.md' }],
        toolName: 'Edit',
        toolUseId: 'edit-tool-2',
        toolInput: { file_path: 'package.json', old_string: 'old', new_string: 'new' }
      })
    ).toMatchObject({
      type: 'prompt',
      request: {
        requestId: 'perm-edit-tool-2',
        path: 'package.json'
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

  it('returns source activation before source tool policy blocks', () => {
    expect(
      checkPreToolUse({
        sourceActivation: {
          sourceSlug: 'linear',
          sourceExists: true
        },
        sourceTool: {
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

  it('returns source activation before prerequisite blocks', () => {
    expect(
      checkPreToolUse({
        prerequisite: {
          type: 'block',
          reason: '必须先读取 source guide。'
        },
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

  it('returns prerequisite blocks before regular permission checks', () => {
    expect(
      checkPreToolUse({
        prerequisite: {
          type: 'block',
          reason: '必须先读取 source guide。'
        },
        toolName: 'Read',
        toolInput: { file_path: 'README.md' }
      })
    ).toEqual({
      type: 'block',
      reason: '必须先读取 source guide。'
    })
  })

  it('returns prerequisite blocks before source tool policy blocks', () => {
    expect(
      checkPreToolUse({
        prerequisite: {
          type: 'block',
          reason: '必须先读取 source guide。'
        },
        sourceTool: {
          sourceSlug: 'linear',
          sourceExists: true
        },
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' }
      })
    ).toEqual({
      type: 'block',
      reason: '必须先读取 source guide。'
    })
  })

  it('returns prerequisite blocks before unsupported tool blocks', () => {
    expect(
      checkPreToolUse({
        prerequisite: {
          type: 'block',
          reason: '必须先读取 source guide。'
        },
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' }
      })
    ).toEqual({
      type: 'block',
      reason: '必须先读取 source guide。'
    })
  })

  it('blocks known source tools with source-specific policy text', () => {
    expect(
      checkPreToolUse({
        sourceTool: {
          sourceSlug: 'linear',
          sourceExists: true
        },
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' }
      })
    ).toEqual({
      type: 'block',
      reason: sourceToolPolicyBlockReason
    })
  })

  it('keeps unknown MCP source tools on the generic unsupported path', () => {
    expect(
      checkPreToolUse({
        toolName: 'mcp__missing__search',
        toolInput: { query: 'Bug' }
      })
    ).toEqual({
      type: 'block',
      reason:
        'Moon 当前阶段只允许 Claude Code SDK 只读工具、Bash 和文件写入审批，已阻止 mcp__missing__search。'
    })
  })
})
