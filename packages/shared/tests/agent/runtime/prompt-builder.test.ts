/**
 * 负责验证基础 agent runtime 系统提示包含 workspace、权限模式和工具约定。
 */

import { describe, expect, it } from 'vitest'

import { buildAgentRuntimeSystemPrompt } from '../../../src/agent'

describe('buildAgentRuntimeSystemPrompt', () => {
  it('includes workspace and local tool instructions', () => {
    const prompt = buildAgentRuntimeSystemPrompt({
      permissionMode: 'ask',
      workspace: {
        name: 'moon',
        path: '/workspace/moon'
      }
    })

    expect(prompt).toContain('当前项目：moon')
    expect(prompt).toContain('项目根目录：/workspace/moon')
    expect(prompt).toContain('权限模式：ask')
    expect(prompt).toContain('/read <path>')
    expect(prompt).toContain('/bash <command>')
  })
})
