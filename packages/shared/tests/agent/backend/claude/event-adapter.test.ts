/**
 * 负责验证 Claude SDK 消息到统一 agent 事件的转换规则。
 * 测试只使用结构化 fixture，不触发真实 Claude SDK 查询。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'

import { ClaudeEventAdapter } from '../../../../src/agent/backend/claude/event-adapter'

/**
 * 把局部 fixture 转成 SDKMessage，避免测试依赖 SDK 私有字段全集。
 */
function sdkMessage(input: unknown): SDKMessage {
  return input as SDKMessage
}

/**
 * 用对象式 ClaudeEventAdapter 适配单条 SDK 消息，贴齐生产链路入口。
 */
function adaptWithAdapter(message: SDKMessage, turnId?: string) {
  const adapter = new ClaudeEventAdapter()

  adapter.startTurn(turnId)
  return adapter.adapt(message)
}

describe('ClaudeEventAdapter', () => {
  it('adds current turn id to turn-scoped text, tool, and error events', () => {
    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'hello' }
          }
        }),
        'turn-1'
      )
    ).toEqual([{ type: 'text_delta', text: 'hello', turnId: 'turn-1' }])

    expect(
      adaptWithAdapter(
        sdkMessage({
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
        }),
        'turn-1'
      )
    ).toEqual([
      {
        type: 'tool_start',
        toolUseId: 'tool-1',
        toolName: 'Read',
        input: { file_path: 'README.md' },
        turnId: 'turn-1'
      }
    ])

    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'assistant',
          error: 'assistant failed',
          message: { content: [] }
        }),
        'turn-1'
      )
    ).toEqual([{ type: 'error', message: 'assistant failed', turnId: 'turn-1' }])
  })

  it('converts stream text deltas to text_delta events', () => {
    expect(
      adaptWithAdapter(
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

  it('converts stream thinking deltas to reasoning_delta events', () => {
    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: 'let me inspect' }
          }
        }),
        'turn-1'
      )
    ).toEqual([{ type: 'reasoning_delta', text: 'let me inspect', turnId: 'turn-1' }])

    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'reasoning_delta', text: 'alternate reasoning payload' }
          }
        })
      )
    ).toEqual([{ type: 'reasoning_delta', text: 'alternate reasoning payload' }])
  })

  it('converts assistant text blocks to text_complete events', () => {
    expect(
      adaptWithAdapter(
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
      adaptWithAdapter(
        sdkMessage({
          type: 'stream_event',
          session_id: 'sdk-session-1',
          event: { type: 'content_block_stop' }
        })
      )
    ).toEqual([{ type: 'session_id_update', sessionId: 'sdk-session-1' }])
  })

  it('emits provider message ids for successful assistant messages', () => {
    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'assistant',
          session_id: 'sdk-session-1',
          uuid: 'sdk-message-1',
          message: { content: [{ type: 'text', text: 'hello' }] }
        })
      )
    ).toEqual([
      { type: 'session_id_update', sessionId: 'sdk-session-1' },
      {
        type: 'provider_message_id_update',
        providerMessageId: 'sdk-message-1',
        providerSessionId: 'sdk-session-1'
      },
      { type: 'text_complete', text: 'hello' }
    ])
  })

  it('converts assistant usage snapshots to usage_update events', () => {
    expect(
      adaptWithAdapter(
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
      adaptWithAdapter(
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

  it('normalizes Bash read commands to Read tool_start events', () => {
    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'assistant',
          parent_tool_use_id: 'parent-tool-1',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Bash',
                input: { command: 'cat README.md' }
              }
            ]
          }
        }),
        'turn-1'
      )
    ).toEqual([
      {
        type: 'tool_start',
        toolUseId: 'tool-1',
        toolName: 'Read',
        input: {
          file_path: 'README.md',
          _command: 'cat README.md'
        },
        parentToolUseId: 'parent-tool-1',
        turnId: 'turn-1'
      }
    ])
  })

  it('keeps non-read Bash commands as Bash tool_start events', () => {
    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Bash',
                input: { command: 'npm test' }
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_start',
        toolUseId: 'tool-1',
        toolName: 'Bash',
        input: { command: 'npm test' }
      }
    ])
  })

  it('converts synthetic user tool_result blocks to tool_result events', () => {
    expect(
      adaptWithAdapter(
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

  it('fills read-classified tool_result metadata from Bash read command state', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Bash',
                input: { command: "sed -n '10,20p' src/app.ts" }
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_start',
        toolUseId: 'tool-1',
        toolName: 'Read',
        input: {
          file_path: 'src/app.ts',
          offset: 10,
          limit: 11,
          _command: "sed -n '10,20p' src/app.ts"
        },
        turnId: 'turn-1'
      }
    ])

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'selected lines',
                is_error: false
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        toolName: 'Read',
        input: {
          file_path: 'src/app.ts',
          offset: 10,
          limit: 11,
          _command: "sed -n '10,20p' src/app.ts"
        },
        isError: false,
        result: 'selected lines',
        turnId: 'turn-1'
      }
    ])
  })

  it('fills tool_result metadata from the current turn tool index', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')
    adapter.adapt(
      sdkMessage({
        type: 'assistant',
        parent_tool_use_id: 'parent-tool-1',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Edit',
              input: { file_path: 'README.md', old_string: 'old', new_string: 'new' }
            }
          ]
        }
      })
    )

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'updated',
                is_error: false
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        toolName: 'Edit',
        input: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
        parentToolUseId: 'parent-tool-1',
        isError: false,
        result: 'updated',
        turnId: 'turn-1'
      }
    ])
  })

  it('clears read command state when starting a new turn', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')
    adapter.adapt(
      sdkMessage({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'cat README.md' }
            }
          ]
        }
      })
    )

    adapter.startTurn('turn-2')

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'fresh result',
                is_error: false
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        isError: false,
        result: 'fresh result',
        turnId: 'turn-2'
      }
    ])
  })

  it('clears tool index and transient block/output state when starting a new turn', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')
    adapter.adapt(
      sdkMessage({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: 'README.md' }
            }
          ]
        }
      })
    )
    adapter.setBlockReason('tool-1', 'blocked in previous turn')
    adapter.accumulateOutput('tool-1', 'previous output')

    adapter.startTurn('turn-2')

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'fresh result',
                is_error: false
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        isError: false,
        result: 'fresh result',
        turnId: 'turn-2'
      }
    ])
  })

  it('keeps block reason precedence for read-classified tool results', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')
    adapter.adapt(
      sdkMessage({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'cat README.md' }
            }
          ]
        }
      })
    )
    adapter.setBlockReason('tool-1', 'User denied permission')

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
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
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        toolName: 'Read',
        input: {
          file_path: 'README.md',
          _command: 'cat README.md'
        },
        isError: true,
        result: 'User denied permission',
        turnId: 'turn-1'
      }
    ])
  })

  it('uses and consumes block reasons for blocked tool results', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')
    adapter.setBlockReason('tool-1', 'User denied permission')

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'fallback text',
                is_error: true
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        isError: true,
        result: 'User denied permission',
        turnId: 'turn-1'
      }
    ])

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'fallback text',
                is_error: true
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        isError: true,
        result: 'fallback text',
        turnId: 'turn-1'
      }
    ])
  })

  it('uses permission-prefixed block reasons for blocked tool results', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')
    adapter.setBlockReason('perm-tool-1', 'Permission hook blocked this tool')

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
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
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        isError: true,
        result: 'Permission hook blocked this tool',
        turnId: 'turn-1'
      }
    ])
  })

  it('uses accumulated command output when tool_result omits content', () => {
    const adapter = new ClaudeEventAdapter()

    adapter.startTurn('turn-1')
    adapter.accumulateOutput('tool-1', 'first chunk\n')
    adapter.accumulateOutput('tool-1', 'second chunk')

    expect(
      adapter.adapt(
        sdkMessage({
          type: 'user',
          isSynthetic: true,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                is_error: false
              }
            ]
          }
        })
      )
    ).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        isError: false,
        result: 'first chunk\nsecond chunk',
        turnId: 'turn-1'
      }
    ])
  })

  it('converts system status messages to status events', () => {
    expect(
      adaptWithAdapter(
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
      adaptWithAdapter(
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

  it('keeps global lifecycle events unscoped even when a turn id is active', () => {
    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'result',
          subtype: 'success',
          is_error: false,
          usage: {
            input_tokens: 10,
            output_tokens: 5
          },
          total_cost_usd: 0.12
        }),
        'turn-1'
      )
    ).toEqual([
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

  it('converts auth status errors to typed errors', () => {
    expect(
      adaptWithAdapter(
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

  it('only attaches turn ids to turn-scoped typed error events', () => {
    expect(
      adaptWithAdapter(
        sdkMessage({
          type: 'auth_status',
          session_id: 'sdk-session-1',
          isAuthenticating: false,
          output: [],
          error: 'login expired'
        }),
        'turn-1'
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
        },
        turnId: 'turn-1'
      }
    ])
  })

  it('converts successful result messages to usage_update and complete events', () => {
    expect(
      adaptWithAdapter(
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
      adaptWithAdapter(
        sdkMessage({
          type: 'assistant',
          error: 'assistant failed',
          message: { content: [] }
        })
      )
    ).toEqual([{ type: 'error', message: 'assistant failed' }])

    expect(
      adaptWithAdapter(
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
      adaptWithAdapter(
        sdkMessage({
          type: 'stream_event',
          event: { type: 'content_block_stop' }
        })
      )
    ).toEqual([])
  })
})
