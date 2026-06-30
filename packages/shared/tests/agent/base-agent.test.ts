/**
 * 负责验证 BaseAgent 承接的 agent 公共生命周期。
 * 测试不触发真实 SDK，只用一个最小子类覆盖基类状态与权限决策流。
 */

import { describe, expect, it } from 'vitest'

import { BaseAgent } from '../../src/agent'
import type {
  AgentChatOptions,
  AgentEvent,
  PendingSourceActivationRestart,
  AgentSourceRecord,
  MessageAttachment
} from '../../src/agent'

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
   * 读取基类初始化出的 source context，避免测试直接访问 protected 字段。
   */
  readSourceContextBlock(): string {
    return this.sourceManager.buildContextBlock()
  }

  /**
   * 暴露 BaseAgent 的 source active helper，供测试验证 protected 边界。
   */
  markSourceActiveForTest(slug: string): boolean {
    return this.markSourceActive(slug)
  }

  /**
   * 暴露 BaseAgent 的 source failed helper，供测试验证 prompt 会看到状态变化。
   */
  markSourceFailedForTest(slug: string, error?: string): boolean {
    return this.markSourceFailed(slug, error)
  }

  /**
   * 消费 BaseAgent 记录的本 turn source activations。
   */
  consumeActivatedSourcesForTest(): string[] {
    return this.consumeActivatedSources()
  }

  /**
   * 暴露 BaseAgent 的 pending source activation 写入能力，验证 first-writer-wins。
   */
  setPendingSourceActivationRestartForTest(pending: PendingSourceActivationRestart): void {
    this.setPendingSourceActivationRestart(pending)
  }

  /**
   * 暴露 BaseAgent 的 pending source activation 消费能力，验证清理语义。
   */
  consumePendingSourceActivationRestartForTest(): PendingSourceActivationRestart | null {
    return this.consumePendingSourceActivationRestart()
  }

  /**
   * 启动并立即返回清理函数，用于验证 startTurn 的 source activation 重置语义。
   */
  beginTurnForTest(): () => void {
    const turn = this.startTurn()

    return () => this.endTurn(turn)
  }

  /**
   * 通过 BaseAgent 持有的 PromptBuilder 构造 provider prompt。
   */
  buildProviderPrompt(message = 'inspect repo'): string {
    return this.buildPrompt(message, [{ role: 'user', content: 'previous question' }])
  }

  /**
   * 通过 BaseAgent 持有的 PermissionManager 检查 Claude 工具权限。
   */
  checkEditPermission() {
    return this.checkClaudeToolUse({
      toolName: 'Edit',
      toolInput: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
      toolUseId: 'edit-tool-1'
    })
  }

  /**
   * 用不同 message 触发测试所需的最小行为。
   */
  async *chat(
    message: string,
    _attachments?: MessageAttachment[],
    options: AgentChatOptions = {}
  ): AsyncGenerator<AgentEvent, void, void> {
    const turn = this.startTurn(options)

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

        const queuedEvents = turn.eventQueue.drain()
        const queuedEvent = await queuedEvents.next()

        if (queuedEvent.done !== true) {
          yield queuedEvent.value
        }

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
  const sources: AgentSourceRecord[] = [
    {
      slug: 'github',
      name: 'GitHub',
      description: 'GitHub repository context',
      status: 'active'
    }
  ]

  it('hydrates shared source manager from constructor sources', () => {
    const agent = new TestAgent({ model: 'claude-sonnet', sources })

    expect(agent.readSourceContextBlock()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
</sources>`)
  })

  it('owns shared source manager state for concrete backends', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    expect(agent.buildSourceContextBlock()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
</sources>`)
  })

  it('exposes protected source status helpers to concrete backends', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      sources: [
        {
          slug: 'github',
          name: 'GitHub',
          description: 'GitHub repository context',
          status: 'inactive'
        }
      ]
    })

    expect(agent.markSourceActiveForTest('github')).toBe(true)
    expect(agent.consumeActivatedSourcesForTest()).toEqual(['github'])

    expect(agent.markSourceFailedForTest('github', 'MCP server failed')).toBe(true)

    expect(agent.readSourceContextBlock()).toBe(`<sources>
Failed:
- github (GitHub): GitHub repository context
  Error: MCP server failed
</sources>`)
  })

  it('clears turn-scoped source activations on startTurn but keeps source state', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      sources: [
        {
          slug: 'github',
          name: 'GitHub',
          description: 'GitHub repository context',
          status: 'inactive'
        }
      ]
    })

    agent.markSourceActiveForTest('github')

    const endTurn = agent.beginTurnForTest()

    expect(agent.consumeActivatedSourcesForTest()).toEqual([])
    expect(agent.readSourceContextBlock()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
</sources>`)

    endTurn()
  })

  it('owns prompt building through shared core modules', () => {
    const agent = new TestAgent({ model: 'claude-sonnet', sources })

    expect(agent.buildProviderPrompt()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
</sources>

USER:
previous question`)
  })

  it('builds prompts from the latest source runtime state', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      sources: [
        {
          slug: 'github',
          name: 'GitHub',
          description: 'GitHub repository context',
          status: 'inactive'
        }
      ]
    })

    agent.markSourceActiveForTest('github')

    expect(agent.buildProviderPrompt()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
</sources>

USER:
previous question`)
  })

  it('keeps the first pending source activation restart until consumed', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    agent.setPendingSourceActivationRestartForTest({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })
    agent.setPendingSourceActivationRestartForTest({
      sourceSlug: 'github',
      originalMessage: 'inspect repo again'
    })

    expect(agent.consumePendingSourceActivationRestartForTest()).toEqual({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })
  })

  it('allows a new pending source activation restart after consume', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    agent.setPendingSourceActivationRestartForTest({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    expect(agent.consumePendingSourceActivationRestartForTest()).toEqual({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    agent.setPendingSourceActivationRestartForTest({
      sourceSlug: 'github',
      originalMessage: 'inspect repo again'
    })

    expect(agent.consumePendingSourceActivationRestartForTest()).toEqual({
      sourceSlug: 'github',
      originalMessage: 'inspect repo again'
    })
    expect(agent.consumePendingSourceActivationRestartForTest()).toBeNull()
  })

  it('clears pending source activation restart when starting a new turn', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    agent.setPendingSourceActivationRestartForTest({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    const endTurn = agent.beginTurnForTest()

    expect(agent.consumePendingSourceActivationRestartForTest()).toBeNull()

    endTurn()
  })

  it('owns permission checks through shared core modules', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      permissionMode: 'ask',
      workspace: { path: '/workspace/moon' }
    })

    expect(agent.checkEditPermission()).toMatchObject({
      type: 'prompt',
      request: {
        requestId: 'perm-edit-tool-1',
        toolName: 'Edit',
        path: 'README.md',
        type: 'file_write'
      }
    })
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
    const events = agent.chat('permission', undefined, { turnId: 'operation-1' })

    await expect(events.next()).resolves.toMatchObject({
      value: {
        type: 'permission_request',
        turnId: 'operation-1',
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
