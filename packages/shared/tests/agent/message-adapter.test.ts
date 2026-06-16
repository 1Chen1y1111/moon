/**
 * 负责验证会话消息到 agent backend 上下文消息的转换规则。
 * 测试只覆盖纯消息语义，不读取附件文件。
 */

import { describe, expect, it } from 'vitest'

import { createAgentBackendMessage } from '../../src/agent'
import type { AgentBackendMessageSource } from '../../src/agent'

/**
 * 创建最小消息 fixture，减少测试对持久化行字段的依赖。
 */
function message(input: Partial<AgentBackendMessageSource>): AgentBackendMessageSource {
  return {
    role: 'user',
    status: 'complete',
    content: 'hello',
    ...input
  }
}

describe('createAgentBackendMessage', () => {
  it('converts user, assistant, and system messages', () => {
    expect(createAgentBackendMessage(message({ role: 'user', content: 'hello' }))).toEqual({
      role: 'user',
      content: 'hello'
    })
    expect(createAgentBackendMessage(message({ role: 'assistant', content: 'hi' }))).toEqual({
      role: 'assistant',
      content: 'hi'
    })
    expect(createAgentBackendMessage(message({ role: 'system', content: 'rules' }))).toEqual({
      role: 'system',
      content: 'rules'
    })
  })

  it('skips failed, cancelled, empty assistant, and tool messages', () => {
    expect(createAgentBackendMessage(message({ status: 'error' }))).toBeNull()
    expect(createAgentBackendMessage(message({ status: 'cancelled' }))).toBeNull()
    expect(createAgentBackendMessage(message({ role: 'assistant', content: '   ' }))).toBeNull()
    expect(createAgentBackendMessage(message({ role: 'tool' }))).toBeNull()
  })
})
