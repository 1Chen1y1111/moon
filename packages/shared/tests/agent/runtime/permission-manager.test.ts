/**
 * 负责验证基础 agent runtime 的权限模式和 workspace 路径边界。
 * 测试只覆盖纯规则，不触发文件系统或命令执行。
 */

import { describe, expect, it } from 'vitest'

import { AgentPermissionManager, isPathInsideWorkspace, resolveWorkspacePath } from '../../../src/agent'

describe('AgentPermissionManager', () => {
  it('denies local tools when no workspace is bound', () => {
    const manager = new AgentPermissionManager()

    expect(
      manager.evaluate({
        id: 'tool-1',
        name: 'list_dir',
        input: { path: '.' }
      })
    ).toMatchObject({
      allowed: false,
      requiresPermission: false,
      reason: 'No active project workspace.'
    })
  })

  it('allows read-only tools inside the workspace', () => {
    const manager = new AgentPermissionManager({
      mode: 'safe',
      workspace: { name: 'moon', path: '/workspace/moon' }
    })

    expect(
      manager.evaluate({
        id: 'tool-1',
        name: 'read_file',
        input: { path: 'README.md' }
      })
    ).toMatchObject({
      allowed: true,
      requiresPermission: false
    })
  })

  it('rejects paths outside the active workspace', () => {
    const manager = new AgentPermissionManager({
      workspace: { name: 'moon', path: '/workspace/moon' }
    })

    expect(
      manager.evaluate({
        id: 'tool-1',
        name: 'read_file',
        input: { path: '../secret.txt' }
      })
    ).toMatchObject({
      allowed: false,
      requiresPermission: false,
      reason: 'Path is outside the active project workspace.'
    })
  })

  it('requires approval for bash unless mode is allow-all', () => {
    const askManager = new AgentPermissionManager({
      mode: 'ask',
      workspace: { name: 'moon', path: '/workspace/moon' }
    })
    const allowAllManager = new AgentPermissionManager({
      mode: 'allow-all',
      workspace: { name: 'moon', path: '/workspace/moon' }
    })
    const request = {
      id: 'tool-1',
      name: 'bash' as const,
      input: { command: 'pnpm test' }
    }

    expect(askManager.evaluate(request)).toMatchObject({
      allowed: false,
      requiresPermission: true,
      type: 'bash'
    })
    expect(allowAllManager.evaluate(request)).toMatchObject({
      allowed: true,
      requiresPermission: false,
      type: 'bash'
    })
  })

  it('normalizes workspace paths before boundary checks', () => {
    const targetPath = resolveWorkspacePath('/workspace/moon', './src/../README.md')

    expect(targetPath).toBe('/workspace/moon/README.md')
    expect(isPathInsideWorkspace('/workspace/moon', targetPath)).toBe(true)
    expect(isPathInsideWorkspace('/workspace/moon', '/workspace/other')).toBe(false)
  })
})
