/**
 * 负责验证 agent runtime 共享的 workspace 路径边界工具。
 * 测试只覆盖纯路径规则，不触发文件系统或命令执行。
 */

import { describe, expect, it } from 'vitest'

import { isPathInsideWorkspace, PermissionManager, resolveWorkspacePath } from '../../../src/agent'

describe('workspace path helpers', () => {
  it('normalizes workspace paths before boundary checks', () => {
    const targetPath = resolveWorkspacePath('/workspace/moon', './src/../README.md')

    expect(targetPath).toBe('/workspace/moon/README.md')
    expect(isPathInsideWorkspace('/workspace/moon', targetPath)).toBe(true)
    expect(isPathInsideWorkspace('/workspace/moon', '/workspace/other')).toBe(false)
  })

  it('treats the workspace root as inside its own boundary', () => {
    expect(isPathInsideWorkspace('/workspace/moon', '/workspace/moon')).toBe(true)
  })
})

describe('PermissionManager', () => {
  const workspace = { path: '/workspace/moon' }

  it('allows Claude read-only tools inside the workspace', () => {
    const permissionManager = new PermissionManager({ workspace })

    expect(
      permissionManager.checkClaudeToolUse({
        toolName: 'Read',
        toolUseId: 'read-tool-1',
        toolInput: { file_path: 'README.md' }
      })
    ).toEqual({ type: 'allow' })
  })

  it('prompts before running Bash commands', () => {
    const permissionManager = new PermissionManager({ workspace })

    expect(
      permissionManager.checkClaudeToolUse({
        toolName: 'Bash',
        toolUseId: 'bash-tool-1',
        toolInput: { command: 'pwd' }
      })
    ).toEqual({
      type: 'prompt',
      request: {
        requestId: 'perm-bash-tool-1',
        toolName: 'Bash',
        description: '需要在项目目录执行命令：pwd',
        command: 'pwd',
        type: 'bash'
      }
    })
  })

  it('prompts for Claude file writes in ask mode', () => {
    const permissionManager = new PermissionManager({ workspace, permissionMode: 'ask' })

    expect(
      permissionManager.checkClaudeToolUse({
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

  it('blocks Claude file writes in safe mode', () => {
    const permissionManager = new PermissionManager({ workspace, permissionMode: 'safe' })

    expect(
      permissionManager.checkClaudeToolUse({
        toolName: 'Write',
        toolUseId: 'write-tool-1',
        toolInput: { file_path: 'generated.txt', content: 'hello' }
      })
    ).toMatchObject({
      type: 'block',
      reason: '安全模式禁止 Claude Code SDK 修改项目文件。'
    })
  })

  it('allows Claude file writes in allow-all mode inside the workspace', () => {
    const permissionManager = new PermissionManager({ workspace, permissionMode: 'allow-all' })

    expect(
      permissionManager.checkClaudeToolUse({
        toolName: 'MultiEdit',
        toolUseId: 'multi-edit-tool-1',
        toolInput: { file_path: 'README.md', edits: [] }
      })
    ).toEqual({ type: 'allow' })
  })

  it('blocks Claude tools outside the workspace before permission mode is applied', () => {
    const permissionManager = new PermissionManager({ workspace, permissionMode: 'allow-all' })

    expect(
      permissionManager.checkClaudeToolUse({
        toolName: 'Edit',
        toolUseId: 'edit-tool-2',
        toolInput: { file_path: '../README.md', old_string: 'old', new_string: 'new' }
      })
    ).toMatchObject({
      type: 'block',
      reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
    })
  })

  it('blocks unsupported Claude tools while Moon only exposes the approved tool set', () => {
    const permissionManager = new PermissionManager({ workspace })

    expect(
      permissionManager.checkClaudeToolUse({
        toolName: 'NotebookEdit',
        toolUseId: 'notebook-tool-1',
        toolInput: {}
      })
    ).toMatchObject({
      type: 'block',
      reason: 'Moon 当前阶段只允许 Claude Code SDK 只读工具、Bash 和文件写入审批，已阻止 NotebookEdit。'
    })
  })
})
