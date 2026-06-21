/**
 * 负责验证 BaseAgent 承接的 agent 公共生命周期。
 * 测试不触发真实 SDK，只用一个最小子类覆盖基类状态与权限决策流。
 */

import { describe, expect, it } from 'vitest'

import { BaseAgent } from '../../src/agent'
import type { AgentChatOptions, AgentEvent, MessageAttachment } from '../../src/agent'

class TestAgent extends BaseAgent {
  lastAbortSignal: AbortSignal | null = null

  /**
   * 通过基类持有的 source manager 写入测试 source，并返回上下文块。
   */
  buildSourceContextBlock(): string {
    this.sourceManager.upsertSource({
      slug: 'github',
      name: 'GitHub',
      description: 'GitHub repository context',
      status: 'active'
    })

    return this.sourceManager.buildContextBlock()
  }

  /**
   * 用不同 message 触发测试所需的最小行为。
   */
  async *chat(
    message: string,
    _attachments?: MessageAttachment[],
    options: AgentChatOptions = {}
  ): AsyncGenerator<AgentEvent, void, void> {
    const turn = this.beginTurn(options)

    this.lastAbortSignal = turn.abortController.signal

    try {
      if (message === 'permission') {
        const decision = this.requestPermission({
          requestId: 'permission-1',
          toolName: 'Bash',
          description: '运行命令',
          command: 'pwd',
          type: 'bash'
        })

        yield await turn.eventQueue.next()

        const result = await decision

        yield {
          type: 'info',
          message: result.approved ? 'approved' : `rejected:${result.reason ?? 'none'}`
        }
        return
      }

      yield { type: 'status', message: this.isProcessing() ? 'processing' : 'idle' }
    } finally {
      this.endTurn(turn)
    }
  }
}

describe('BaseAgent', () => {
  it('owns shared source manager state for concrete backends', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    expect(agent.buildSourceContextBlock()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
</sources>`)
  })

  it('owns common model state', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    expect(agent.getModel()).toBe('claude-sonnet')

    agent.setModel('claude-opus')

    expect(agent.getModel()).toBe('claude-opus')
  })

  it('tracks processing while a turn is active', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })
    const events = agent.chat('status')

    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'status', message: 'processing' },
      done: false
    })
    expect(agent.isProcessing()).toBe(true)

    await events.next()

    expect(agent.isProcessing()).toBe(false)
  })

  it('aborts the active turn and clears runtime state', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })
    const events = agent.chat('status')

    await events.next()

    await agent.abort('stop')

    expect(agent.lastAbortSignal?.aborted).toBe(true)
    expect(agent.isProcessing()).toBe(false)

    await events.return(undefined)
  })

  it('resolves permission requests through respondToPermission', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })
    const events = agent.chat('permission')

    await expect(events.next()).resolves.toMatchObject({
      value: {
        type: 'permission_request',
        request: {
          requestId: 'permission-1',
          toolName: 'Bash',
          command: 'pwd',
          type: 'bash'
        }
      },
      done: false
    })

    agent.respondToPermission('permission-1', true)

    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'info', message: 'approved' },
      done: false
    })
  })

  it('rejects pending permission requests when destroyed', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })
    const events = agent.chat('permission')

    await events.next()

    agent.destroy()

    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'info', message: 'rejected:Agent destroyed.' },
      done: false
    })
    expect(agent.isProcessing()).toBe(false)
  })
})
