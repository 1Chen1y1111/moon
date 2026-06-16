/**
 * 负责验证 ClaudeAgent 对 SDK query 的最小参数传递。
 * 测试使用 mock query，不触发真实 Claude SDK 进程或网络调用。
 */

import { describe, expect, it, vi } from 'vitest'

import { ClaudeAgent } from '../../src/agent'
import type { AgentEvent } from '../../src/agent'

/**
 * 创建返回单条 assistant 消息的 Claude SDK query mock。
 */
function createQueryClaudeMock() {
  return vi.fn(async function* () {
    yield {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'ok' }]
      }
    }
  })
}

/**
 * 创建返回 result 成功消息的 Claude SDK query mock。
 */
function createResultQueryClaudeMock() {
  return vi.fn(async function* () {
    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'sdk-session-1',
      usage: {
        input_tokens: 1,
        output_tokens: 2
      },
      total_cost_usd: 0.01
    }
  })
}

describe('ClaudeAgent', () => {
  it('passes configured thinking level to Claude SDK options', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      thinkingLevel: 'high'
    })

    for await (const _event of agent.chat('hello')) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(queryClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          maxThinkingTokens: 8192
        })
      })
    )
  })

  it('lets per-call thinking override take precedence over configured level', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      thinkingLevel: 'high'
    })

    for await (const _event of agent.chat('hello', undefined, { thinkingOverride: 'low' })) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(queryClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          maxThinkingTokens: 1024
        })
      })
    )
  })

  it('does not append a fallback complete event after SDK result completion', async () => {
    const queryClaude = createResultQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('hello')) {
      events.push(event)
    }

    expect(events.filter((event) => event.type === 'complete')).toEqual([
      {
        type: 'complete',
        usage: {
          costUsd: 0.01,
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3
        }
      }
    ])
  })
})
