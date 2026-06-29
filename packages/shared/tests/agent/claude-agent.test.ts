/**
 * 负责验证 ClaudeAgent 对 SDK query 的最小参数传递。
 * 测试使用 mock query，不触发真实 Claude SDK 进程或网络调用。
 */

import { describe, expect, it, vi } from 'vitest'
import type { Options } from '@anthropic-ai/claude-agent-sdk'

import { ClaudeAgent } from '../../src/agent'
import type { AgentEvent, AgentSourceRecord } from '../../src/agent'

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

/**
 * 创建返回多种 turn-scoped 事件的 Claude SDK query mock。
 */
function createTurnScopedQueryClaudeMock() {
  return vi.fn(async function* () {
    yield {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hello' }
      }
    }
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: 'README.md' }
          }
        ]
      }
    }
    yield {
      type: 'assistant',
      error: 'assistant failed',
      message: {
        content: []
      }
    }
  })
}

/**
 * 创建会触发 Claude SDK Bash PreToolUse hook 的 query mock。
 */
function createBashHookQueryClaudeMock() {
  return vi.fn(async function* ({ options }: { options?: Options }) {
    const hook = options?.hooks?.PreToolUse?.[0]?.hooks[0]
    const hookResult = await hook?.(
      {
        hook_event_name: 'PreToolUse',
        session_id: 'sdk-session-1',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/workspace/moon',
        tool_name: 'Bash',
        tool_input: { command: 'pwd' },
        tool_use_id: 'bash-tool-1'
      },
      'bash-tool-1',
      { signal: new AbortController().signal }
    )

    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text:
              hookResult !== undefined && 'continue' in hookResult && hookResult.continue
                ? 'allowed'
                : 'blocked'
          }
        ]
      }
    }
  })
}

/**
 * 创建在 SDK iterator 结束前排入权限事件但不等待审批的 query mock。
 */
function createDetachedPermissionHookQueryClaudeMock() {
  return vi.fn(async function* ({ options }: { options?: Options }) {
    const hook = options?.hooks?.PreToolUse?.[0]?.hooks[0]

    void hook?.(
      {
        hook_event_name: 'PreToolUse',
        session_id: 'sdk-session-1',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/workspace/moon',
        tool_name: 'Bash',
        tool_input: { command: 'pwd' },
        tool_use_id: 'detached-bash-tool-1'
      },
      'detached-bash-tool-1',
      { signal: new AbortController().signal }
    )
  })
}

/**
 * 创建会触发 Claude SDK Edit PreToolUse hook 的 query mock。
 */
function createEditHookQueryClaudeMock() {
  return vi.fn(async function* ({ options }: { options?: Options }) {
    const hook = options?.hooks?.PreToolUse?.[0]?.hooks[0]
    const hookResult = await hook?.(
      {
        hook_event_name: 'PreToolUse',
        session_id: 'sdk-session-1',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/workspace/moon',
        tool_name: 'Edit',
        tool_input: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
        tool_use_id: 'edit-tool-1'
      },
      'edit-tool-1',
      { signal: new AbortController().signal }
    )

    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text:
              hookResult !== undefined && 'continue' in hookResult && hookResult.continue
                ? 'edit allowed'
                : 'edit blocked'
          }
        ]
      }
    }
  })
}

/**
 * 创建返回 unknown 错误但写入 stderr 详情的 Claude SDK query mock。
 */
function createUnknownErrorWithStderrQueryClaudeMock() {
  return vi.fn(async function* ({ options }: { options?: Options }) {
    options?.stderr?.('provider rejected request: invalid beta header')

    yield {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: 'sdk-session-1',
      errors: ['unknown'],
      usage: {
        input_tokens: 1,
        output_tokens: 0
      },
      total_cost_usd: 0
    }
  })
}

/**
 * 创建只返回 unknown 错误且没有 stderr 的 Claude SDK query mock。
 */
function createUnknownErrorQueryClaudeMock() {
  return vi.fn(async function* () {
    yield {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      session_id: 'sdk-session-1',
      errors: ['unknown']
    }
  })
}

/**
 * 创建只返回认证失败错误码的 Claude SDK query mock。
 */
function createAuthenticationFailedQueryClaudeMock() {
  return vi.fn(async function* () {
    yield {
      type: 'assistant',
      error: 'authentication_failed',
      message: {
        content: []
      }
    }
  })
}

describe('ClaudeAgent', () => {
  const sources: AgentSourceRecord[] = [
    {
      slug: 'github',
      name: 'GitHub',
      description: 'GitHub repository context',
      status: 'active'
    }
  ]

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

  it('passes serialized history prompt to Claude SDK when no workspace is configured', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [
        { role: 'system', content: 'follow project rules' },
        { role: 'user', content: 'previous question' }
      ],
      queryClaude: queryClaude as never
    })

    for await (const _event of agent.chat('current question')) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(queryClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'SYSTEM:\nfollow project rules\n\nUSER:\nprevious question'
      })
    )
  })

  it('prepends configured sources to the Claude SDK prompt', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      sources
    })

    for await (const _event of agent.chat('inspect repo')) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(queryClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: `<sources>
Active:
- github (GitHub): GitHub repository context
</sources>

inspect repo`
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

  it('flushes queued permission events when the SDK iterator finishes first', async () => {
    const queryClaude = createDetachedPermissionHookQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      workspace: {
        path: '/workspace/moon'
      }
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('run detached command', undefined, {
      turnId: 'operation-1'
    })) {
      events.push(event)
    }

    const permissionIndex = events.findIndex((event) => event.type === 'permission_request')
    const completeIndex = events.findIndex((event) => event.type === 'complete')

    expect(events[permissionIndex]).toMatchObject({
      type: 'permission_request',
      turnId: 'operation-1',
      request: {
        requestId: 'perm-detached-bash-tool-1',
        toolName: 'Bash',
        command: 'pwd',
        type: 'bash'
      }
    })
    expect(permissionIndex).toBeGreaterThanOrEqual(0)
    expect(completeIndex).toBeGreaterThan(permissionIndex)
  })

  it('scopes Claude text, tool, and error events to the provided turn id', async () => {
    const queryClaude = createTurnScopedQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('hello', undefined, { turnId: 'operation-1' })) {
      events.push(event)
    }

    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'text_delta', text: 'hello', turnId: 'operation-1' },
        {
          type: 'tool_start',
          toolUseId: 'tool-1',
          toolName: 'Read',
          input: { file_path: 'README.md' },
          turnId: 'operation-1'
        },
        { type: 'error', message: 'assistant failed', turnId: 'operation-1' }
      ])
    )
  })

  it('uses Claude SDK stderr details when result error is unknown', async () => {
    const queryClaude = createUnknownErrorWithStderrQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('hello')) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'error',
      message: expect.stringContaining(
        'Claude SDK failed: provider rejected request: invalid beta header'
      )
    })
  })

  it('adds runtime diagnostics to Claude SDK authentication failures', async () => {
    const queryClaude = createAuthenticationFailedQueryClaudeMock()
    const agent = new ClaudeAgent({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-v4-flash',
      messages: [],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('hello')) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'error',
      message: expect.stringContaining(
        'runtime: model=deepseek-v4-flash, baseUrl=https://api.deepseek.com/anthropic, authEnv=ANTHROPIC_AUTH_TOKEN, claudeConfig=isolated, debugFile='
      )
    })
  })

  it('adds runtime diagnostics to unhelpful Claude SDK errors', async () => {
    const queryClaude = createUnknownErrorQueryClaudeMock()
    const agent = new ClaudeAgent({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-v4-flash',
      messages: [],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('hello')) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'error',
      message: expect.stringContaining(
        'Claude SDK failed: unknown (runtime: model=deepseek-v4-flash, baseUrl=https://api.deepseek.com/anthropic, authEnv=ANTHROPIC_AUTH_TOKEN, claudeConfig=isolated, debugFile='
      )
    })
  })

  it('configures Claude Code SDK tools with project workspace cwd', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [
        { role: 'system', content: 'project context' },
        { role: 'user', content: 'previous question' }
      ],
      queryClaude: queryClaude as never,
      workspace: {
        name: 'moon',
        path: '/workspace/moon'
      }
    })

    for await (const _event of agent.chat('inspect project')) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(queryClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'USER:\nprevious question',
        options: expect.objectContaining({
          allowDangerouslySkipPermissions: true,
          cwd: '/workspace/moon',
          permissionMode: 'bypassPermissions',
          systemPrompt: expect.objectContaining({
            append: expect.stringContaining('/workspace/moon'),
            preset: 'claude_code',
            type: 'preset'
          }),
          tools: { type: 'preset', preset: 'claude_code' }
        })
      })
    )

    const queryCalls = queryClaude.mock.calls as unknown as Array<[{ options?: Options }]>
    expect(queryCalls[0]?.[0].options?.systemPrompt).toMatchObject({
      append: expect.not.stringContaining('运行 pwd')
    })
  })

  it('allows only read-only Claude Code tools inside the workspace', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      permissionMode: 'safe',
      queryClaude: queryClaude as never,
      workspace: {
        path: '/workspace/moon'
      }
    })

    for await (const _event of agent.chat('inspect project')) {
      // 消费事件流以触发 SDK query mock。
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<[{ options?: Options }]>
    const options = queryCalls[0]?.[0].options
    const hook = options?.hooks?.PreToolUse?.[0]?.hooks[0]

    expect(hook).toBeDefined()

    await expect(
      hook?.(
        {
          hook_event_name: 'PreToolUse',
          session_id: 'sdk-session-1',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: '/workspace/moon',
          tool_name: 'Read',
          tool_input: { file_path: 'package.json' },
          tool_use_id: 'tool-1'
        },
        'tool-1',
        { signal: new AbortController().signal }
      )
    ).resolves.toEqual({ continue: true })

    const bashDecision = hook?.(
      {
        hook_event_name: 'PreToolUse',
        session_id: 'sdk-session-1',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/workspace/moon',
        tool_name: 'Bash',
        tool_input: { command: 'pwd' },
        tool_use_id: 'tool-2'
      },
      'tool-2',
      { signal: new AbortController().signal }
    )

    agent.respondToPermission('perm-tool-2', false)

    await expect(bashDecision).resolves.toMatchObject({ continue: false, decision: 'block' })

    await expect(
      hook?.(
        {
          hook_event_name: 'PreToolUse',
          session_id: 'sdk-session-1',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: '/workspace/moon',
          tool_name: 'Read',
          tool_input: { file_path: '../secret.txt' },
          tool_use_id: 'tool-3'
        },
        'tool-3',
        { signal: new AbortController().signal }
      )
    ).resolves.toMatchObject({ continue: false, decision: 'block' })

    await expect(
      hook?.(
        {
          hook_event_name: 'PreToolUse',
          session_id: 'sdk-session-1',
          transcript_path: '/tmp/transcript.jsonl',
          cwd: '/workspace/moon',
          tool_name: 'Write',
          tool_input: { file_path: 'generated.txt', content: 'hello' },
          tool_use_id: 'tool-4'
        },
        'tool-4',
        { signal: new AbortController().signal }
      )
    ).resolves.toMatchObject({ continue: false, decision: 'block' })
  })

  it('emits a permission request when Claude Code SDK asks to run Bash', async () => {
    const queryClaude = createBashHookQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      workspace: {
        path: '/workspace/moon'
      }
    })
    const events = agent.chat('run pwd', undefined, { turnId: 'operation-1' })

    const permissionEvent = await events.next()

    expect(permissionEvent.value).toMatchObject({
      type: 'permission_request',
      turnId: 'operation-1',
      request: {
        requestId: 'perm-bash-tool-1',
        toolName: 'Bash',
        command: 'pwd',
        type: 'bash'
      }
    })

    agent.respondToPermission('perm-bash-tool-1', true)

    const textEvent = await events.next()

    expect(textEvent.value).toMatchObject({
      type: 'text_complete',
      text: 'allowed',
      turnId: 'operation-1'
    })
  })

  it('emits a permission request when Claude Code SDK asks to edit a file', async () => {
    const queryClaude = createEditHookQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      workspace: {
        path: '/workspace/moon'
      }
    })
    const events = agent.chat('update README')

    const permissionEvent = await events.next()

    expect(permissionEvent.value).toMatchObject({
      type: 'permission_request',
      request: {
        requestId: 'perm-edit-tool-1',
        toolName: 'Edit',
        description: '需要修改项目文件：README.md',
        path: 'README.md',
        type: 'file_write',
        impact: '写操作会改变当前项目工作区文件。'
      }
    })

    agent.respondToPermission('perm-edit-tool-1', true)

    const textEvent = await events.next()

    expect(textEvent.value).toMatchObject({ type: 'text_complete', text: 'edit allowed' })
  })
})
