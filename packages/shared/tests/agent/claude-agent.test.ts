/**
 * 负责验证 ClaudeAgent 对 SDK query 的最小参数传递。
 * 测试使用 mock query，不触发真实 Claude SDK 进程或网络调用。
 */

import { describe, expect, it, vi } from 'vitest'
import type { Options } from '@anthropic-ai/claude-agent-sdk'

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
        prompt: expect.not.stringContaining('SYSTEM:\nproject context'),
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
  })

  it('allows only read-only Claude Code tools inside the workspace', async () => {
    const queryClaude = createQueryClaudeMock()
    const agent = new ClaudeAgent({
      model: 'claude-sonnet',
      messages: [],
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

    await expect(
      hook?.(
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
    ).resolves.toMatchObject({ continue: false, decision: 'block' })

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
  })
})
