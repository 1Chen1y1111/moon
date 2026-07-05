/**
 * 负责验证 Claude source activation tool_result handler 的识别和 pending 写入语义。
 * 测试只覆盖 inactive source tool 错误处理，不接入 runner、auto-retry 或真实 MCP 执行。
 */

import { describe, expect, it, vi } from 'vitest'

import { handleClaudeSourceActivationToolResult } from '../../../../src/agent/backend/claude/source-activation-handler'
import { AgentSourceRuntime } from '../../../../src/agent/core/agent-source-runtime'
import {
  type AgentEvent,
  type AgentSourceRecord,
  type PendingSourceActivationRestart
} from '../../../../src/agent'

type ToolResultAgentEvent = Extract<AgentEvent, { type: 'tool_result' }>

/**
 * 创建包含单个 Linear source 的 AgentSourceRuntime，方便覆盖 active/inactive/unknown 分支。
 */
function createSourceRuntime(
  status: AgentSourceRecord['status'] = 'inactive'
): AgentSourceRuntime {
  return new AgentSourceRuntime({
    sources: [
      {
        slug: 'linear',
        name: 'Linear',
        status
      }
    ]
  })
}

/**
 * 创建 Claude tool-not-found 形态的 tool_result 事件。
 */
function createToolResultEvent(
  overrides: Partial<ToolResultAgentEvent> = {}
): ToolResultAgentEvent {
  return {
    type: 'tool_result',
    toolUseId: 'source-tool-1',
    toolName: 'mcp__linear__createIssue',
    input: { title: 'Bug' },
    isError: true,
    result: 'No such tool available: mcp__linear__createIssue',
    ...overrides
  }
}

describe('handleClaudeSourceActivationToolResult', () => {
  it('records pending restart when inactive source activation succeeds', async () => {
    const requestSourceActivation = vi.fn(async () => true)
    const setPendingSourceActivationRestart = vi.fn(
      (_pending: PendingSourceActivationRestart): void => undefined
    )

    await handleClaudeSourceActivationToolResult({
      event: createToolResultEvent(),
      originalMessage: 'create linear issue',
      requestSourceActivation,
      setPendingSourceActivationRestart,
      sourceRuntime: createSourceRuntime()
    })

    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(setPendingSourceActivationRestart).toHaveBeenCalledWith({
      sourceSlug: 'linear',
      originalMessage: 'create linear issue'
    })
  })

  it('does not record pending restart when activation returns false', async () => {
    const requestSourceActivation = vi.fn(async () => false)
    const setPendingSourceActivationRestart = vi.fn()

    await handleClaudeSourceActivationToolResult({
      event: createToolResultEvent(),
      originalMessage: 'create linear issue',
      requestSourceActivation,
      setPendingSourceActivationRestart,
      sourceRuntime: createSourceRuntime()
    })

    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(setPendingSourceActivationRestart).not.toHaveBeenCalled()
  })

  it('does not record pending restart when activation throws', async () => {
    const requestSourceActivation = vi.fn(async () => {
      throw new Error('activation crashed')
    })
    const setPendingSourceActivationRestart = vi.fn()

    await handleClaudeSourceActivationToolResult({
      event: createToolResultEvent(),
      originalMessage: 'create linear issue',
      requestSourceActivation,
      setPendingSourceActivationRestart,
      sourceRuntime: createSourceRuntime()
    })

    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(setPendingSourceActivationRestart).not.toHaveBeenCalled()
  })

  it('does not request activation without a source activation callback', async () => {
    const setPendingSourceActivationRestart = vi.fn()

    await handleClaudeSourceActivationToolResult({
      event: createToolResultEvent(),
      originalMessage: 'create linear issue',
      requestSourceActivation: null,
      setPendingSourceActivationRestart,
      sourceRuntime: createSourceRuntime()
    })

    expect(setPendingSourceActivationRestart).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'active source',
      event: createToolResultEvent(),
      sourceRuntime: createSourceRuntime('active')
    },
    {
      name: 'unknown source',
      event: createToolResultEvent(),
      sourceRuntime: new AgentSourceRuntime({ sources: [] })
    },
    {
      name: 'non-source tool-not-found',
      event: createToolResultEvent({
        toolName: 'Read',
        result: "Tool 'Read' not found"
      }),
      sourceRuntime: createSourceRuntime()
    },
    {
      name: 'non-error tool_result',
      event: createToolResultEvent({
        isError: false,
        result: 'ok'
      }),
      sourceRuntime: createSourceRuntime()
    }
  ])('does not request activation for $name', async ({ event, sourceRuntime }) => {
    const requestSourceActivation = vi.fn(async () => true)
    const setPendingSourceActivationRestart = vi.fn()

    await handleClaudeSourceActivationToolResult({
      event,
      originalMessage: 'create linear issue',
      requestSourceActivation,
      setPendingSourceActivationRestart,
      sourceRuntime
    })

    expect(requestSourceActivation).not.toHaveBeenCalled()
    expect(setPendingSourceActivationRestart).not.toHaveBeenCalled()
  })
})
