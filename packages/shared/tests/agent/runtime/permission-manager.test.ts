/**
 * 负责验证 agent runtime 共享的 workspace 路径边界工具。
 * 测试只覆盖纯路径规则，不触发文件系统或命令执行。
 */

import { describe, expect, it } from 'vitest'

import { isPathInsideWorkspace, resolveWorkspacePath } from '../../../src/agent'

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
