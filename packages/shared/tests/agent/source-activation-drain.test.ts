/**
 * 负责验证 source activation drain controller 的纯事件控制语义。
 * 测试不接入 Claude SDK、MCP、abort 或 auto-retry，只检查批次边界何时发出 source_activated。
 */

import { describe, expect, it } from 'vitest'

import { SourceActivationDrainController, type AgentEvent } from '../../src/agent'
import type { PendingSourceActivationRestart } from '../../src/agent'

function createToolResult(toolUseId: string): AgentEvent {
  return {
    type: 'tool_result',
    toolUseId,
    toolName: 'mcp__session__source_test',
    result: 'source activated',
    isError: false,
    turnId: 'turn-1'
  }
}

function createTextEvent(): AgentEvent {
  return {
    type: 'text_delta',
    text: 'next assistant text',
    turnId: 'turn-1'
  }
}

/**
 * 创建按顺序消费 pending activation 的函数，用于模拟 BaseAgent 的 pending 状态。
 */
function consumeQueue(
  ...records: Array<PendingSourceActivationRestart | null>
): () => PendingSourceActivationRestart | null {
  const queue = [...records]

  return () => queue.shift() ?? null
}

describe('SourceActivationDrainController', () => {
  it('captures the first pending activation from a tool result', () => {
    const drain = new SourceActivationDrainController()
    const consumePending = consumeQueue({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    expect(drain.observe(createToolResult('tool-1'), consumePending)).toBe(true)
    expect(drain.capturedSlug).toBe('workspace')
  })

  it('drains sibling events after capture until the batch boundary fires', () => {
    const drain = new SourceActivationDrainController()
    const consumePending = consumeQueue(
      {
        sourceSlug: 'workspace',
        originalMessage: 'inspect repo'
      },
      {
        sourceSlug: 'github',
        originalMessage: 'inspect repo'
      },
      null
    )

    expect(drain.observe(createToolResult('tool-1'), consumePending)).toBe(true)
    expect(drain.observe(createToolResult('tool-2'), consumePending)).toBe(true)
    expect(drain.observe(createTextEvent(), consumePending)).toBe(true)

    expect(drain.shouldFireAtBoundary()).toEqual({
      type: 'source_activated',
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })
  })

  it('fires source activation only once at the batch boundary', () => {
    const drain = new SourceActivationDrainController()
    const consumePending = consumeQueue({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    drain.observe(createToolResult('tool-1'), consumePending)

    expect(drain.shouldFireAtBoundary()).toEqual({
      type: 'source_activated',
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })
    expect(drain.shouldFireAtBoundary()).toBeNull()
    expect(drain.hasFired).toBe(true)
  })

  it('does not fire when no pending activation is available', () => {
    const drain = new SourceActivationDrainController()

    expect(drain.observe(createToolResult('tool-1'), consumeQueue(null))).toBe(false)
    expect(drain.shouldFireAtBoundary()).toBeNull()
  })

  it('does not capture pending activation from non-tool-result events', () => {
    const drain = new SourceActivationDrainController()
    const consumePending = consumeQueue({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    expect(drain.observe(createTextEvent(), consumePending)).toBe(false)
    expect(drain.capturedSlug).toBeNull()
    expect(drain.shouldFireAtBoundary()).toBeNull()
  })
})
