/**
 * 负责验证 BaseAgent 承接的 agent 公共生命周期。
 * 测试不触发真实 SDK，只用一个最小子类覆盖基类状态与权限决策流。
 */

import { describe, expect, it } from 'vitest'

import { BaseAgent } from '../../src/agent'
import type {
  AgentChatOptions,
  AgentEvent,
  AgentPermissionDecision,
  PendingSourceActivationRestart,
  AgentSourceRecord,
  ClaudeToolUsePermissionInput,
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
   * 使用指定历史消息构造 provider prompt，验证 workspace/source prompt 合同。
   */
  buildProviderPromptWithMessages(
    message: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): string {
    return this.buildPrompt(message, messages)
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
   * 透出通用 Claude 工具权限检查，验证 BaseAgent 的 source activation 短路。
   */
  checkToolUseForTest(input: ClaudeToolUsePermissionInput) {
    return this.checkClaudeToolUse(input)
  }

  /**
   * 创建一个权限请求后立即结束 turn，用于验证 endTurn 会拒绝未决权限。
   */
  requestPermissionThenEndTurnForTest(): Promise<AgentPermissionDecision> {
    const turn = this.startTurn({ turnId: 'operation-1' })
    const decision = this.requestPermission({
      requestId: 'permission-1',
      toolName: 'Bash',
      description: '运行命令',
      command: 'pwd',
      type: 'bash'
    })

    this.endTurn(turn)

    return decision
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
          message: result.approved
            ? result.alwaysAllow === true
              ? 'approved:always'
              : 'approved'
            : `rejected:${result.reason ?? 'none'}`
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

    expect(agent.buildProviderPrompt()).toBe(`<session_state>
permissionMode: ask
</session_state>

<sources>
Active:
- github (GitHub): GitHub repository context
</sources>

USER:
previous question`)
  })

  it('builds workspace prompts from sources and non-system history only', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      sources: [
        {
          slug: 'workspace',
          name: 'Workspace',
          description: 'Local workspace source',
          guidePath: '/workspace/moon/AGENTS.md',
          instructions: 'Claude-first only. Pi and MCP are deferred.',
          status: 'active'
        }
      ],
      workspace: {
        name: 'moon',
        path: '/workspace/moon'
      }
    })

    expect(
      agent.buildProviderPromptWithMessages('current question', [
        { role: 'system', content: 'project system context' },
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
        { role: 'user', content: 'current question' }
      ])
    ).toBe(`<session_state>
permissionMode: ask
workspacePath: /workspace/moon
</session_state>

<sources>
Active:
- workspace (Workspace): Local workspace source
  Guide: /workspace/moon/AGENTS.md
  Instructions:
Claude-first only. Pi and MCP are deferred.
</sources>

USER:
previous question

ASSISTANT:
previous answer

USER:
current question`)
  })

  it('uses the current message as fallback when workspace filtering removes history', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      workspace: {
        name: 'moon',
        path: '/workspace/moon'
      }
    })

    expect(
      agent.buildProviderPromptWithMessages('inspect workspace', [
        { role: 'system', content: 'project system context' }
      ])
    ).toBe(`<session_state>
permissionMode: ask
workspacePath: /workspace/moon
</session_state>

inspect workspace`)
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

    expect(agent.buildProviderPrompt()).toBe(`<session_state>
permissionMode: ask
</session_state>

<sources>
Active:
- github (GitHub): GitHub repository context
</sources>

USER:
previous question`)
  })

  it('keeps the first pending source activation restart until consumed', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    agent.setPendingSourceActivationRestart({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })
    agent.setPendingSourceActivationRestart({
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

    agent.setPendingSourceActivationRestart({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    expect(agent.consumePendingSourceActivationRestartForTest()).toEqual({
      sourceSlug: 'workspace',
      originalMessage: 'inspect repo'
    })

    agent.setPendingSourceActivationRestart({
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

    agent.setPendingSourceActivationRestart({
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

  it('reports source activation needs before regular Claude permission checks', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      permissionMode: 'ask',
      workspace: { path: '/workspace/moon' },
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          description: 'Linear issues',
          guidePath: 'sources/linear/guide.md',
          status: 'inactive'
        }
      ]
    })

    expect(
      agent.checkToolUseForTest({
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      })
    ).toEqual({
      type: 'source_activation_needed',
      sourceSlug: 'linear',
      sourceExists: true
    })
  })

  it('blocks active source tools until the source guide is read in the session', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      permissionMode: 'ask',
      workspace: { path: '/workspace/moon' },
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          guidePath: 'sources/linear/guide.md',
          status: 'active'
        }
      ]
    })

    expect(
      agent.checkToolUseForTest({
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      })
    ).toEqual({
      type: 'block',
      reason:
        '使用 source "linear" 的工具前，必须先用 Read 读取 source guide：sources/linear/guide.md。'
    })
  })

  it('keeps active source tools on the regular permission path after the guide is read', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      permissionMode: 'ask',
      workspace: { path: '/workspace/moon' },
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          guidePath: 'sources/linear/guide.md',
          status: 'active'
        }
      ]
    })

    expect(
      agent.checkToolUseForTest({
        toolName: 'Read',
        toolInput: { file_path: './sources/linear/../linear/guide.md' },
        toolUseId: 'read-tool-1'
      })
    ).toEqual({
      type: 'modify',
      toolInput: { file_path: 'sources/linear/guide.md' }
    })

    expect(agent.buildProviderPrompt()).toContain(
      'sourceGuideReads:\n- sourceSlug="linear" guidePath="/workspace/moon/sources/linear/guide.md"'
    )

    expect(
      agent.checkToolUseForTest({
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      })
    ).toMatchObject({
      type: 'block',
      reason:
        'Moon 当前阶段只允许 Claude Code SDK 只读工具、Bash 和文件写入审批，已阻止 mcp__linear__createIssue。'
    })
  })

  it('keeps active source tools on the regular permission path', () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      permissionMode: 'ask',
      workspace: { path: '/workspace/moon' },
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          status: 'active'
        }
      ]
    })

    expect(
      agent.checkToolUseForTest({
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      })
    ).toMatchObject({
      type: 'block',
      reason:
        'Moon 当前阶段只允许 Claude Code SDK 只读工具、Bash 和文件写入审批，已阻止 mcp__linear__createIssue。'
    })
  })

  it('owns common model state', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    expect(agent.getModel()).toBe('claude-sonnet')

    agent.setModel('claude-opus')

    expect(agent.getModel()).toBe('claude-opus')
  })

  it('starts without a source activation request callback', () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    expect(agent.onSourceActivationRequest).toBeNull()
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

  it('bridges an already-aborted external signal into the active turn', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })
    const abortController = new AbortController()

    abortController.abort('cancelled')

    const events = agent.chat('status', undefined, {
      abortSignal: abortController.signal
    })

    await events.next()

    expect(agent.lastAbortSignal?.aborted).toBe(true)

    await events.return(undefined)
  })

  it('bridges external aborts while a turn is active', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })
    const abortController = new AbortController()
    const events = agent.chat('status', undefined, {
      abortSignal: abortController.signal
    })

    await events.next()

    abortController.abort('cancelled')

    expect(agent.lastAbortSignal?.aborted).toBe(true)

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

  it('passes alwaysAllow permission decisions through respondToPermission', async () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      workspace: { path: '/workspace/moon' }
    })
    const events = agent.chat('permission')

    await events.next()

    agent.respondToPermission('permission-1', true, true)

    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'info', message: 'approved:always' },
      done: false
    })

    await events.next()

    expect(
      agent.checkToolUseForTest({
        toolName: 'Bash',
        toolInput: { command: 'pwd' },
        toolUseId: 'bash-tool-1'
      })
    ).toEqual({ type: 'allow' })
    expect(agent.buildProviderPrompt()).toContain(
      'permissionGrants:\n- type="bash" toolName="Bash" command="pwd"'
    )
  })

  it('does not add session permission grants for one-time approvals', async () => {
    const agent = new TestAgent({
      model: 'claude-sonnet',
      workspace: { path: '/workspace/moon' }
    })
    const events = agent.chat('permission')

    await events.next()

    agent.respondToPermission('permission-1', true)

    await events.next()
    await events.next()

    expect(
      agent.checkToolUseForTest({
        toolName: 'Bash',
        toolInput: { command: 'pwd' },
        toolUseId: 'bash-tool-1'
      })
    ).toMatchObject({
      type: 'prompt',
      request: {
        command: 'pwd'
      }
    })
  })

  it('rejects pending permission requests when aborted', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })
    const events = agent.chat('permission')

    await events.next()

    await agent.abort('stop')

    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'info', message: 'rejected:stop' },
      done: false
    })
    expect(agent.isProcessing()).toBe(false)
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

  it('rejects pending permission requests when the turn ends', async () => {
    const agent = new TestAgent({ model: 'claude-sonnet' })

    await expect(agent.requestPermissionThenEndTurnForTest()).resolves.toEqual({
      requestId: 'permission-1',
      approved: false,
      reason: 'Agent turn ended.'
    })
    expect(agent.isProcessing()).toBe(false)
  })
})
