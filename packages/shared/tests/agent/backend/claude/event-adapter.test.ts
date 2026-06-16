/**
 * 负责验证 Claude SDK 消息到统一 agent 事件的转换规则。
 * 测试只使用结构化 fixture，不触发真实 Claude SDK 查询。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'

import { adaptClaudeSdkMessage } from '../../../../src/agent/backend/claude/event-adapter'

/**
 * 把局部 fixture 转成 SDKMessage，避免测试依赖 SDK 私有字段全集。
 */
function sdkMessage(input: unknown): SDKMessage {
  return input as SDKMessage
}

describe('adaptClaudeSdkMessage', () => {
  it('converts stream text deltas to text_delta events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'hello' }
          }
        })
      )
    ).toEqual([{ type: 'text_delta', text: 'hello' }])
  })

  it('converts assistant text blocks to text_complete events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'hello' },
              { type: 'text', text: ' world' }
            ]
          }
        })
      )
    ).toEqual([{ type: 'text_complete', text: 'hello world' }])
  })

  it('emits session id updates when SDK messages carry session ids', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'stream_event',
          session_id: 'sdk-session-1',
          event: { type: 'content_block_stop' }
        })
      )
    ).toEqual([{ type: 'session_id_update', sessionId: 'sdk-session-1' }])
  })

  it('converts assistant usage snapshots to usage_update events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'assistant',
          session_id: 'sdk-session-1',
          message: {
            content: [{ type: 'text', text: 'hello' }],
            usage: {
              input_tokens: 10,
              output_tokens: 3,
              cache_read_input_tokens: 2,
              cache_creation_input_tokens: 1
            }
          }
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      { type: 'text_complete', text: 'hello' },
      {
        type: 'usage_update',
        usage: {
          cacheCreationTokens: 1,
          cacheReadTokens: 2,
          inputTokens: 10,
          outputTokens: 3,
          totalTokens: 16
        }
      }
    ])
  })

  it('converts assistant tool_use blocks to tool_start events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'assistant',
          session_id: 'sdk-session-1',
          parent_tool_use_id: 'parent-tool-1',
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
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      {
        type: 'tool_start',
        toolUseId: 'tool-1',
        toolName: 'Read',
        input: { file_path: 'README.md' },
        parentToolUseId: 'parent-tool-1'
      }
    ])
  })

  it('converts synthetic user tool_result blocks to tool_result events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'user',
          session_id: 'sdk-session-1',
          isSynthetic: true,
          tool_use_result: { output: 'hello' },
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'fallback text',
                is_error: false
              }
            ]
          }
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        isError: false,
        result: { output: 'hello' }
      }
    ])
  })

  it('converts system status messages to status events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'system',
          subtype: 'status',
          status: 'compacting',
          session_id: 'sdk-session-1'
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      {
        type: 'status',
        message: 'Claude is compacting context.',
        statusType: 'compacting'
      }
    ])
  })

  it('converts tool progress messages to info events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'tool_progress',
          session_id: 'sdk-session-1',
          tool_use_id: 'tool-1',
          tool_name: 'Read',
          elapsed_time_seconds: 3
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      {
        type: 'info',
        level: 'info',
        message: 'Claude tool Read is running (3s).'
      }
    ])
  })

  it('converts auth status errors to typed errors', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'auth_status',
          session_id: 'sdk-session-1',
          isAuthenticating: false,
          output: [],
          error: 'login expired'
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      {
        type: 'typed_error',
        error: {
          code: 'claude_auth_status_error',
          title: 'Claude authentication failed',
          message: 'login expired',
          canRetry: true
        }
      }
    ])
  })

  it('converts successful result messages to usage_update and complete events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: 'sdk-session-1',
          usage: {
            input_tokens: 10,
            output_tokens: 5
          },
          total_cost_usd: 0.12
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      {
        type: 'usage_update',
        usage: {
          costUsd: 0.12,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15
        }
      },
      {
        type: 'complete',
        usage: {
          costUsd: 0.12,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15
        }
      }
    ])
  })

  it('converts assistant and result errors to error events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'assistant',
          error: 'assistant failed',
          message: { content: [] }
        })
      )
    ).toEqual([{ type: 'error', message: 'assistant failed' }])

    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'result',
          is_error: true,
          errors: ['first failure', 'second failure']
        })
      )
    ).toEqual([{ type: 'error', message: 'first failure\nsecond failure' }])
  })

  it('ignores SDK messages that do not carry user-visible events', () => {
    expect(
      adaptClaudeSdkMessage(
        sdkMessage({
          type: 'stream_event',
          event: { type: 'content_block_stop' }
        })
      )
    ).toEqual([])
  })
})
