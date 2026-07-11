/**
 * 负责验证 ClaudeAgent 的 SDK query 参数、事件流和 resume 失效恢复。
 * 测试使用 mock query，不触发真实 Claude SDK 进程或网络调用。
 */

import { describe, expect, it, vi } from 'vitest'
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import {
  ClaudeAgent,
  clearProviderSessionId,
  createAgentSessionRuntimeState,
  setProviderSessionId
} from '../../src/agent'
import type { AgentEvent, AgentSourceRecord, PendingSourceActivationRestart } from '../../src/agent'

/**
 * 暴露 BaseAgent 的 pending source activation 写入能力，供 ClaudeAgent 链路测试模拟未来触发器。
 */
class SourceActivationTestClaudeAgent extends ClaudeAgent {
  setPendingSourceActivationRestartForTest(pending: PendingSourceActivationRestart): void {
    this.setPendingSourceActivationRestart(pending)
  }
}

/**
 * 读取 Claude query 的流式用户输入；字符串 prompt 在调用该 helper 时视为测试失败。
 */
async function collectSdkUserMessages(
  prompt: string | AsyncIterable<SDKUserMessage>
): Promise<SDKUserMessage[]> {
  if (typeof prompt === 'string') {
    throw new Error('Expected an SDK user message stream.')
  }

  const messages: SDKUserMessage[] = []

  for await (const message of prompt) {
    messages.push(message)
  }

  return messages
}

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
 * 创建会产出工具开始和工具结果的 Claude SDK query mock。
 */
function createToolResultQueryClaudeMock(onBeforeToolResult?: () => void) {
  return vi.fn(async function* () {
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: 'README.md' }
          },
          {
            type: 'tool_use',
            id: 'tool-2',
            name: 'Read',
            input: { file_path: 'package.json' }
          }
        ]
      }
    }

    onBeforeToolResult?.()

    yield {
      type: 'user',
      isSynthetic: true,
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'readme content',
            is_error: false
          },
          {
            type: 'tool_result',
            tool_use_id: 'tool-2',
            content: 'package content',
            is_error: false
          }
        ]
      }
    }

    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'sdk-session-1'
    }
  })
}

/**
 * 创建会产出 inactive source tool-not-found 错误的 Claude SDK query mock。
 */
function createInactiveSourceToolErrorQueryClaudeMock(
  errorMessage = 'No such tool available: mcp__linear__createIssue'
) {
  return vi.fn(async function* () {
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'source-tool-1',
            name: 'mcp__linear__createIssue',
            input: { title: 'Bug' }
          }
        ]
      }
    }

    yield {
      type: 'user',
      isSynthetic: true,
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'source-tool-1',
            content: errorMessage,
            is_error: true
          }
        ]
      }
    }

    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'sdk-session-1'
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

  it('passes active turn cancellation into Claude SDK query options', async () => {
    const queryClaude = createQueryClaudeMock()
    const abortController = new AbortController()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })

    abortController.abort('cancelled')

    for await (const _event of agent.chat('hello', undefined, {
      abortSignal: abortController.signal
    })) {
      // 消费事件流以触发 SDK query mock。
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<[{ options?: Options }]>
    const queryOptions = queryCalls.at(0)?.[0].options
    const queryAbortController = queryOptions?.abortController

    expect(queryAbortController).toBeInstanceOf(AbortController)
    expect(queryAbortController?.signal.aborted).toBe(true)
  })

  it('resumes the provider session stored in shared thread runtime state', async () => {
    const queryClaude = createQueryClaudeMock()
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'previous turn' }],
      queryClaude: queryClaude as never
    })

    for await (const _event of agent.chat('first turn')) {
      // 消费首轮事件流以触发 SDK query mock。
    }

    setProviderSessionId(agentSessionState, 'sdk-session-1')

    for await (const _event of agent.chat('second turn')) {
      // 消费第二轮事件流以触发 SDK query mock。
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<
      [{ options?: Options; prompt?: string }]
    >

    expect(queryCalls[0]?.[0].prompt).toContain('previous turn')
    expect(queryCalls[0]?.[0].options).not.toHaveProperty('resume')
    expect(queryCalls[1]?.[0].prompt).toContain('second turn')
    expect(queryCalls[1]?.[0].prompt).not.toContain('previous turn')
    expect(queryCalls[1]?.[0].options).toMatchObject({ resume: 'sdk-session-1' })
  })

  it('forks a provider session at the configured provider message', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [
        { role: 'user', content: 'parent question' },
        { role: 'assistant', content: 'parent answer' },
        { role: 'user', content: 'branch question' }
      ],
      providerSessionFork: {
        providerSessionId: 'sdk-session-parent',
        providerMessageId: 'sdk-message-source'
      },
      queryClaude: queryClaude as never
    })

    for await (const _event of agent.chat('branch question')) {
      // 消费事件流以触发 SDK query mock。
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<
      [{ options?: Options; prompt?: string }]
    >

    expect(queryCalls[0]?.[0].options).toMatchObject({
      resume: 'sdk-session-parent',
      forkSession: true,
      resumeSessionAt: 'sdk-message-source'
    })
    expect(queryCalls[0]?.[0].prompt).toContain('branch question')
    expect(queryCalls[0]?.[0].prompt).not.toContain('parent question')
  })

  it('builds Claude image and PDF content blocks from current-turn attachments', async () => {
    const capturedMessages: SDKUserMessage[][] = []
    const queryClaude = vi.fn(async function* ({
      prompt
    }: {
      prompt: string | AsyncIterable<SDKUserMessage>
    }) {
      capturedMessages.push(await collectSdkUserMessages(prompt))
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'attachments understood' }] }
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })

    for await (const _event of agent.chat('inspect attachments', [
      {
        type: 'image',
        name: 'diagram.png',
        mimeType: 'image/png',
        size: 4,
        base64: 'AQIDBA=='
      },
      {
        type: 'pdf',
        name: 'spec.pdf',
        mimeType: 'application/pdf',
        size: 9,
        base64: 'cGRmIGJ5dGVz'
      }
    ])) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(capturedMessages).toHaveLength(1)
    expect(capturedMessages[0]).toEqual([
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: expect.stringContaining('inspect attachments')
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'AQIDBA=='
              }
            },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: 'cGRmIGJ5dGVz'
              }
            }
          ]
        },
        parent_tool_use_id: null,
        session_id: ''
      }
    ])
  })

  it('keeps text-only attachments on the normal string prompt path', async () => {
    const prompts: Array<string | AsyncIterable<SDKUserMessage>> = []
    const queryClaude = vi.fn(async function* ({
      prompt
    }: {
      prompt: string | AsyncIterable<SDKUserMessage>
    }) {
      prompts.push(prompt)
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'text attachment understood' }] }
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })

    for await (const _event of agent.chat('read attached text', [
      {
        type: 'text',
        name: 'note.txt',
        mimeType: 'text/plain',
        size: 5,
        path: '/tmp/note.txt'
      }
    ])) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(prompts).toHaveLength(1)
    expect(typeof prompts[0]).toBe('string')
    expect(prompts[0]).toEqual(expect.stringContaining('read attached text'))
  })

  it('recreates the same binary attachment input when resume recovery retries fresh', async () => {
    let attempt = 0
    const capturedMessages: SDKUserMessage[][] = []
    const queryClaude = vi.fn(async function* ({
      prompt
    }: {
      prompt: string | AsyncIterable<SDKUserMessage>
    }) {
      attempt += 1
      capturedMessages.push(await collectSdkUserMessages(prompt))

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          session_id: 'sdk-session-expired',
          errors: ['No conversation found with session ID: sdk-session-expired']
        }
        return
      }

      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'restored with image' }] }
      }
    })
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
        { role: 'user', content: 'inspect image' }
      ],
      queryClaude: queryClaude as never
    })
    const imageAttachment = {
      type: 'image' as const,
      name: 'diagram.png',
      mimeType: 'image/png',
      size: 4,
      base64: 'AQIDBA=='
    }

    setProviderSessionId(agentSessionState, 'sdk-session-expired')

    for await (const _event of agent.chat('inspect image', [imageAttachment])) {
      // 消费恢复前后的两次 query。
    }

    const firstContent = capturedMessages[0]?.[0]?.message.content
    const secondContent = capturedMessages[1]?.[0]?.message.content

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(capturedMessages).toHaveLength(2)
    expect(firstContent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image' }),
        expect.objectContaining({
          type: 'text',
          text: expect.not.stringContaining('previous question')
        })
      ])
    )
    expect(secondContent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image' }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('previous question')
        })
      ])
    )
    expect(
      Array.isArray(firstContent) ? firstContent.filter((block) => block.type === 'image') : []
    ).toHaveLength(1)
    expect(
      Array.isArray(secondContent) ? secondContent.filter((block) => block.type === 'image') : []
    ).toHaveLength(1)
  })

  it('clears an expired resumed session and retries once with Moon message history', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* () {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          session_id: 'sdk-session-expired',
          errors: ['No conversation found with session ID: sdk-session-expired']
        }
        return
      }

      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'restored answer' }] }
      }
      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: 'sdk-session-fresh'
      }
    })
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
        { role: 'user', content: 'current question' }
      ],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    setProviderSessionId(agentSessionState, 'sdk-session-expired')

    for await (const event of agent.chat('current question')) {
      events.push(event)

      if (event.type === 'session_id_update') {
        setProviderSessionId(agentSessionState, event.sessionId)
      } else if (event.type === 'session_id_clear') {
        clearProviderSessionId(agentSessionState)
      }
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<
      [{ options?: Options; prompt?: string }]
    >

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(queryCalls[0]?.[0].options).toMatchObject({ resume: 'sdk-session-expired' })
    expect(queryCalls[0]?.[0].prompt).not.toContain('previous question')
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('resume')
    expect(queryCalls[1]?.[0].prompt).toContain('previous question')
    expect(queryCalls[1]?.[0].prompt).toContain('current question')
    expect(events.filter((event) => event.type === 'complete')).toEqual([{ type: 'complete' }])
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'session_id_clear' },
        { type: 'info', message: 'Restoring conversation context...' },
        { type: 'text_complete', text: 'restored answer' },
        { type: 'session_id_update', sessionId: 'sdk-session-fresh' }
      ])
    )
    expect(events.some((event) => event.type === 'error')).toBe(false)
    expect(agentSessionState.providerSessionId).toBe('sdk-session-fresh')
  })

  it('drops fork options and retries with lineage history when the parent session expired', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* () {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          session_id: 'sdk-session-parent',
          errors: ['No conversation found with session ID: sdk-session-parent']
        }
        return
      }

      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'restored branch answer' }] }
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [
        { role: 'user', content: 'parent question' },
        { role: 'assistant', content: 'parent answer' },
        { role: 'user', content: 'branch question' }
      ],
      providerSessionFork: {
        providerSessionId: 'sdk-session-parent',
        providerMessageId: 'sdk-message-source'
      },
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('branch question')) {
      events.push(event)
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<
      [{ options?: Options; prompt?: string }]
    >

    expect(queryCalls[0]?.[0].options).toMatchObject({
      resume: 'sdk-session-parent',
      forkSession: true,
      resumeSessionAt: 'sdk-message-source'
    })
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('resume')
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('forkSession')
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('resumeSessionAt')
    expect(queryCalls[1]?.[0].prompt).toContain('parent question')
    expect(queryCalls[1]?.[0].prompt).toContain('branch question')
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'session_id_clear' },
        { type: 'info', message: 'Restoring conversation context...' },
        { type: 'text_complete', text: 'restored branch answer' }
      ])
    )
  })

  it('retries a compacted branch anchor on the established child session without cutoff', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* () {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          session_id: 'sdk-session-child',
          errors: ['No message found with message.uuid of: sdk-message-source']
        }
        return
      }

      yield {
        type: 'assistant',
        session_id: 'sdk-session-child',
        uuid: 'sdk-message-child',
        message: { content: [{ type: 'text', text: 'nearest branch context answer' }] }
      }
      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: 'sdk-session-child'
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [
        { role: 'user', content: 'parent question' },
        { role: 'assistant', content: 'parent answer' },
        { role: 'user', content: 'branch question' }
      ],
      providerSessionFork: {
        providerSessionId: 'sdk-session-parent',
        providerMessageId: 'sdk-message-source'
      },
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('branch question')) {
      events.push(event)
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<
      [{ options?: Options; prompt?: string }]
    >

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(queryCalls[0]?.[0].options).toMatchObject({
      resume: 'sdk-session-parent',
      forkSession: true,
      resumeSessionAt: 'sdk-message-source'
    })
    expect(queryCalls[1]?.[0].options).toMatchObject({ resume: 'sdk-session-child' })
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('forkSession')
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('resumeSessionAt')
    expect(queryCalls[1]?.[0].prompt).toContain('branch question')
    expect(queryCalls[1]?.[0].prompt).not.toContain('parent question')
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'session_id_update', sessionId: 'sdk-session-child' },
        {
          type: 'info',
          message: 'Branch point was compacted, retrying with the forked conversation...'
        },
        { type: 'text_complete', text: 'nearest branch context answer' }
      ])
    )
    expect(events.filter((event) => event.type === 'complete')).toEqual([{ type: 'complete' }])
    expect(events.some((event) => event.type === 'session_id_clear')).toBe(false)
    expect(events.some((event) => event.type === 'error')).toBe(false)
  })

  it('recognizes a compacted branch anchor from stderr and a thrown process error', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* ({ options }: { options?: Options }) {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'stream_event',
          session_id: 'sdk-session-child',
          event: { type: 'content_block_stop' }
        }
        options?.stderr?.('No message found with message.uuid of: sdk-message-source')
        throw new Error('process exited with code 1')
      }

      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'restored from branch stderr' }] }
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'branch question' }],
      providerSessionFork: {
        providerSessionId: 'sdk-session-parent',
        providerMessageId: 'sdk-message-source'
      },
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('branch question')) {
      events.push(event)
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<
      [{ options?: Options; prompt?: string }]
    >

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(queryCalls[1]?.[0].options).toMatchObject({ resume: 'sdk-session-child' })
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('resumeSessionAt')
    expect(events).toEqual(
      expect.arrayContaining([{ type: 'text_complete', text: 'restored from branch stderr' }])
    )
    expect(events.some((event) => event.type === 'error')).toBe(false)
  })

  it('falls back to lineage history when a compacted branch anchor has no child session', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* () {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          session_id: 'sdk-session-parent',
          errors: ['No message found with message.uuid of: sdk-message-source']
        }
        return
      }

      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'fresh branch answer' }] }
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [
        { role: 'user', content: 'parent question' },
        { role: 'assistant', content: 'parent answer' },
        { role: 'user', content: 'branch question' }
      ],
      providerSessionFork: {
        providerSessionId: 'sdk-session-parent',
        providerMessageId: 'sdk-message-source'
      },
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('branch question')) {
      events.push(event)
    }

    const queryCalls = queryClaude.mock.calls as unknown as Array<
      [{ options?: Options; prompt?: string }]
    >

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('resume')
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('forkSession')
    expect(queryCalls[1]?.[0].options).not.toHaveProperty('resumeSessionAt')
    expect(queryCalls[1]?.[0].prompt).toContain('parent question')
    expect(queryCalls[1]?.[0].prompt).toContain('branch question')
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'session_id_clear' },
        { type: 'info', message: 'Restoring conversation context...' },
        { type: 'text_complete', text: 'fresh branch answer' }
      ])
    )
    expect(events.some((event) => event.type === 'error')).toBe(false)
  })

  it('does not retry a compacted branch anchor after assistant content has started', async () => {
    const queryClaude = vi.fn(async function* () {
      yield {
        type: 'assistant',
        session_id: 'sdk-session-child',
        uuid: 'sdk-message-child',
        message: { content: [{ type: 'text', text: 'partial branch answer' }] }
      }
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        session_id: 'sdk-session-child',
        errors: ['No message found with message.uuid of: sdk-message-source']
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'branch question' }],
      providerSessionFork: {
        providerSessionId: 'sdk-session-parent',
        providerMessageId: 'sdk-message-source'
      },
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('branch question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(1)
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'text_complete', text: 'partial branch answer' },
        { type: 'error', message: 'No message found with message.uuid of: sdk-message-source' }
      ])
    )
    expect(events.some((event) => event.type === 'session_id_clear')).toBe(false)
  })

  it('does not make a third query when branch cutoff recovery fails', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* () {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          session_id: 'sdk-session-child',
          errors: ['No message found with message.uuid of: sdk-message-source']
        }
        return
      }

      yield {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        session_id: 'sdk-session-child',
        errors: ['No conversation found with session ID: sdk-session-child']
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'branch question' }],
      providerSessionFork: {
        providerSessionId: 'sdk-session-parent',
        providerMessageId: 'sdk-message-source'
      },
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('branch question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'error', message: 'No conversation found with session ID: sdk-session-child' }
      ])
    )
  })

  it('recognizes an expired resumed session reported through stderr and a thrown error', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* ({ options }: { options?: Options }) {
      attempt += 1

      if (attempt === 1) {
        options?.stderr?.('No conversation found with session ID: sdk-session-expired')
        throw new Error('process exited with code 1')
      }

      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'restored from stderr' }] }
      }
    })
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'current question' }],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    setProviderSessionId(agentSessionState, 'sdk-session-expired')

    for await (const event of agent.chat('current question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(events).toEqual([
      { type: 'session_id_clear' },
      { type: 'info', message: 'Restoring conversation context...' },
      { type: 'text_complete', text: 'restored from stderr' },
      { type: 'complete' }
    ])
  })

  it('retries a resumed query that completes without assistant content and discards its complete', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* () {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: 'sdk-session-empty'
        }
        return
      }

      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'fresh response' }] }
      }
    })
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'current question' }],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    setProviderSessionId(agentSessionState, 'sdk-session-expired')

    for await (const event of agent.chat('current question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(events.filter((event) => event.type === 'complete')).toEqual([{ type: 'complete' }])
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'session_id_update', sessionId: 'sdk-session-empty' },
        { type: 'session_id_clear' },
        { type: 'text_complete', text: 'fresh response' }
      ])
    )
  })

  it('does not retry an empty first query when no provider session was resumed', async () => {
    const queryClaude = vi.fn(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: 'sdk-session-first'
      }
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'first question' }],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('first question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-first' },
      { type: 'complete' }
    ])
  })

  it('does not retry authentication errors from a resumed query', async () => {
    const queryClaude = createAuthenticationFailedQueryClaudeMock()
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'current question' }],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    setProviderSessionId(agentSessionState, 'sdk-session-1')

    for await (const event of agent.chat('current question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(1)
    expect(events.some((event) => event.type === 'session_id_clear')).toBe(false)
    expect(events).toContainEqual({
      type: 'error',
      message: expect.stringContaining('authentication_failed')
    })
    expect(agentSessionState.providerSessionId).toBe('sdk-session-1')
  })

  it('does not retry an expired-session marker after assistant content has started', async () => {
    const queryClaude = vi.fn(async function* () {
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'partial response' }] }
      }
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        session_id: 'sdk-session-1',
        errors: ['No conversation found with session ID: sdk-session-1']
      }
    })
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'current question' }],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    setProviderSessionId(agentSessionState, 'sdk-session-1')

    for await (const event of agent.chat('current question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(1)
    expect(events.some((event) => event.type === 'session_id_clear')).toBe(false)
    expect(events).toContainEqual({ type: 'text_complete', text: 'partial response' })
    expect(events).toContainEqual({
      type: 'error',
      message: 'No conversation found with session ID: sdk-session-1'
    })
  })

  it('does not retry when cancellation wins before an empty resume recovery', async () => {
    const abortController = new AbortController()
    const queryClaude = vi.fn(async function* () {
      abortController.abort('cancelled')
      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: 'sdk-session-empty'
      }
    })
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'current question' }],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    setProviderSessionId(agentSessionState, 'sdk-session-1')

    for await (const event of agent.chat('current question', undefined, {
      abortSignal: abortController.signal
    })) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(1)
    expect(events.some((event) => event.type === 'session_id_clear')).toBe(false)
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Cancelled by user.' })
  })

  it('surfaces a fresh retry failure without starting a third query', async () => {
    let attempt = 0
    const queryClaude = vi.fn(async function* () {
      attempt += 1

      if (attempt === 1) {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          session_id: 'sdk-session-expired',
          errors: ['No conversation found with session ID: sdk-session-expired']
        }
        return
      }

      throw new Error('network unavailable')
    })
    const agentSessionState = createAgentSessionRuntimeState()
    const agent = new ClaudeAgent({
      agentSessionState,
      model: 'claude-sonnet',
      messages: [{ role: 'user', content: 'current question' }],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    setProviderSessionId(agentSessionState, 'sdk-session-expired')

    for await (const event of agent.chat('current question')) {
      events.push(event)
    }

    expect(queryClaude).toHaveBeenCalledTimes(2)
    expect(events.filter((event) => event.type === 'session_id_clear')).toHaveLength(1)
    expect(events.at(-1)).toEqual({ type: 'error', message: 'network unavailable' })
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
        prompt: `<session_state>
permissionMode: ask
</session_state>

SYSTEM:
follow project rules

USER:
previous question`,
        options: expect.objectContaining({
          includePartialMessages: true,
          model: 'claude-sonnet',
          permissionMode: 'dontAsk',
          tools: []
        })
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
        prompt: `<session_state>
permissionMode: ask
</session_state>

<sources>
Active:
- github (GitHub): GitHub repository context
</sources>

inspect repo`
      })
    )
  })

  it('passes workspace source context and filtered history to Claude SDK query', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [
        { role: 'system', content: 'project system context' },
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
        { role: 'user', content: 'current question' }
      ],
      queryClaude: queryClaude as never,
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

    for await (const _event of agent.chat('current question')) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(queryClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: `<session_state>
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
current question`,
        options: expect.objectContaining({
          allowDangerouslySkipPermissions: true,
          cwd: '/workspace/moon',
          includePartialMessages: true,
          model: 'claude-sonnet',
          permissionMode: 'bypassPermissions',
          systemPrompt: expect.objectContaining({
            append: expect.stringContaining('项目根目录：/workspace/moon'),
            preset: 'claude_code',
            type: 'preset'
          }),
          tools: { type: 'preset', preset: 'claude_code' }
        })
      })
    )
  })

  it('uses current user text as prompt fallback when workspace filters history out', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [{ role: 'system', content: 'project system context' }],
      queryClaude: queryClaude as never,
      workspace: {
        name: 'moon',
        path: '/workspace/moon'
      }
    })

    for await (const _event of agent.chat('inspect workspace')) {
      // 消费事件流以触发 SDK query mock。
    }

    expect(queryClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: `<session_state>
permissionMode: ask
workspacePath: /workspace/moon
</session_state>

inspect workspace`
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

  it('emits source activation after draining the current tool result batch', async () => {
    let agent!: SourceActivationTestClaudeAgent
    const queryClaude = createToolResultQueryClaudeMock(() => {
      agent.setPendingSourceActivationRestartForTest({
        sourceSlug: 'workspace',
        originalMessage: 'inspect repo'
      })
    })
    agent = new SourceActivationTestClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('inspect repo', undefined, { turnId: 'operation-1' })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'tool_start',
        toolUseId: 'tool-1',
        toolName: 'Read',
        input: { file_path: 'README.md' },
        turnId: 'operation-1'
      },
      {
        type: 'tool_start',
        toolUseId: 'tool-2',
        toolName: 'Read',
        input: { file_path: 'package.json' },
        turnId: 'operation-1'
      },
      {
        type: 'source_activated',
        sourceSlug: 'workspace',
        originalMessage: 'inspect repo',
        turnId: 'operation-1'
      }
    ])
    expect(events.some((event) => event.type === 'tool_result')).toBe(false)
    expect(events.some((event) => event.type === 'complete')).toBe(false)
  })

  it('activates inactive sources from tool-not-found tool results and ends the turn', async () => {
    const queryClaude = createInactiveSourceToolErrorQueryClaudeMock()
    const requestSourceActivation = vi.fn(async () => true)
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          status: 'inactive'
        }
      ]
    })
    const events: AgentEvent[] = []

    agent.onSourceActivationRequest = requestSourceActivation

    for await (const event of agent.chat('create linear issue', undefined, {
      turnId: 'operation-1'
    })) {
      events.push(event)
    }

    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(events).toEqual([
      {
        type: 'tool_start',
        toolUseId: 'source-tool-1',
        toolName: 'mcp__linear__createIssue',
        input: { title: 'Bug' },
        turnId: 'operation-1'
      },
      {
        type: 'source_activated',
        sourceSlug: 'linear',
        originalMessage: 'create linear issue',
        turnId: 'operation-1'
      }
    ])
    expect(events.some((event) => event.type === 'tool_result')).toBe(false)
    expect(events.some((event) => event.type === 'complete')).toBe(false)
  })

  it('keeps the original inactive source tool error when activation fails', async () => {
    const queryClaude = createInactiveSourceToolErrorQueryClaudeMock()
    const requestSourceActivation = vi.fn(async () => false)
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          status: 'inactive'
        }
      ]
    })
    const events: AgentEvent[] = []

    agent.onSourceActivationRequest = requestSourceActivation

    for await (const event of agent.chat('create linear issue', undefined, {
      turnId: 'operation-1'
    })) {
      events.push(event)
    }

    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'tool_result',
          toolUseId: 'source-tool-1',
          toolName: 'mcp__linear__createIssue',
          input: { title: 'Bug' },
          isError: true,
          result: 'No such tool available: mcp__linear__createIssue',
          turnId: 'operation-1'
        },
        { type: 'complete' }
      ])
    )
    expect(events.some((event) => event.type === 'source_activated')).toBe(false)
  })

  it('keeps the original inactive source tool error when activation throws', async () => {
    const queryClaude = createInactiveSourceToolErrorQueryClaudeMock()
    const requestSourceActivation = vi.fn(async () => {
      throw new Error('activation crashed')
    })
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          status: 'inactive'
        }
      ]
    })
    const events: AgentEvent[] = []

    agent.onSourceActivationRequest = requestSourceActivation

    for await (const event of agent.chat('create linear issue', undefined, {
      turnId: 'operation-1'
    })) {
      events.push(event)
    }

    expect(requestSourceActivation).toHaveBeenCalledWith('linear')
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'tool_result',
          toolUseId: 'source-tool-1',
          toolName: 'mcp__linear__createIssue',
          input: { title: 'Bug' },
          isError: true,
          result: 'No such tool available: mcp__linear__createIssue',
          turnId: 'operation-1'
        },
        { type: 'complete' }
      ])
    )
    expect(events.some((event) => event.type === 'source_activated')).toBe(false)
  })

  it('keeps the original inactive source tool error when no activation callback exists', async () => {
    const queryClaude = createInactiveSourceToolErrorQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          status: 'inactive'
        }
      ]
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('create linear issue', undefined, {
      turnId: 'operation-1'
    })) {
      events.push(event)
    }

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'tool_result',
          toolUseId: 'source-tool-1',
          toolName: 'mcp__linear__createIssue',
          input: { title: 'Bug' },
          isError: true,
          result: 'No such tool available: mcp__linear__createIssue',
          turnId: 'operation-1'
        },
        { type: 'complete' }
      ])
    )
    expect(events.some((event) => event.type === 'source_activated')).toBe(false)
  })

  it.each([
    {
      name: 'active',
      sources: [{ slug: 'linear', name: 'Linear', status: 'active' as const }]
    },
    {
      name: 'unknown',
      sources: [] as AgentSourceRecord[]
    }
  ])('keeps $name source tool-not-found errors on the normal path', async ({ sources }) => {
    const queryClaude = createInactiveSourceToolErrorQueryClaudeMock()
    const requestSourceActivation = vi.fn(async () => true)
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never,
      sources
    })
    const events: AgentEvent[] = []

    agent.onSourceActivationRequest = requestSourceActivation

    for await (const event of agent.chat('create linear issue', undefined, {
      turnId: 'operation-1'
    })) {
      events.push(event)
    }

    expect(requestSourceActivation).not.toHaveBeenCalled()
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'tool_result',
          toolUseId: 'source-tool-1',
          toolName: 'mcp__linear__createIssue',
          input: { title: 'Bug' },
          isError: true,
          result: 'No such tool available: mcp__linear__createIssue',
          turnId: 'operation-1'
        },
        { type: 'complete' }
      ])
    )
    expect(events.some((event) => event.type === 'source_activated')).toBe(false)
  })

  it('keeps normal tool result and completion behavior without pending source activation', async () => {
    const queryClaude = createToolResultQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
      queryClaude: queryClaude as never
    })
    const events: AgentEvent[] = []

    for await (const event of agent.chat('inspect repo', undefined, { turnId: 'operation-1' })) {
      events.push(event)
    }

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'tool_result',
          toolUseId: 'tool-1',
          toolName: 'Read',
          input: { file_path: 'README.md' },
          isError: false,
          result: 'readme content',
          turnId: 'operation-1'
        },
        {
          type: 'tool_result',
          toolUseId: 'tool-2',
          toolName: 'Read',
          input: { file_path: 'package.json' },
          isError: false,
          result: 'package content',
          turnId: 'operation-1'
        },
        { type: 'complete' }
      ])
    )
    expect(events.some((event) => event.type === 'source_activated')).toBe(false)
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
        prompt: `<session_state>
permissionMode: ask
workspacePath: /workspace/moon
</session_state>

USER:
previous question`,
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
