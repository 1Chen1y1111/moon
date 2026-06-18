/**
 * 负责验证 CompatAnthropicMessagesAgent 的 HTTP 请求和 SSE 事件转换。
 * 测试使用 mock fetch，不触发真实 provider 网络请求。
 */

import { describe, expect, it, vi } from 'vitest'

import { CompatAnthropicMessagesAgent } from '../../src/agent/compat-anthropic-messages-agent'
import type { AgentEvent } from '../../src/agent'

/**
 * 把 SSE 文本包装成 fetch 可返回的流式 Response。
 */
function createSseResponse(content: string): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content))
        controller.close()
      }
    }),
    {
      headers: {
        'content-type': 'text/event-stream'
      }
    }
  )
}

/**
 * 消费 agent 事件流，便于断言完整输出。
 */
async function collectEvents(
  agent: CompatAnthropicMessagesAgent,
  message: string
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []

  for await (const event of agent.chat(message)) {
    events.push(event)
  }

  return events
}

describe('CompatAnthropicMessagesAgent', () => {
  it('posts messages to the Anthropic-compatible stream endpoint', async () => {
    const fetchAnthropic = vi.fn().mockResolvedValue(
      createSseResponse(
        [
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
          '',
          'event: message_stop',
          'data: {"type":"message_stop"}',
          '',
          ''
        ].join('\n')
      )
    )
    const agent = new CompatAnthropicMessagesAgent({
      apiKey: 'sk-test',
      baseUrl: 'https://compat.example.com',
      fetchAnthropic,
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' }
      ],
      model: 'compat-model'
    })

    const events = await collectEvents(agent, '你好')
    const [, request] = fetchAnthropic.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body))

    expect(fetchAnthropic).toHaveBeenCalledWith(
      'https://compat.example.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          authorization: 'Bearer sk-test',
          'x-api-key': 'sk-test'
        })
      })
    )
    expect(body).toMatchObject({
      max_tokens: 4096,
      model: 'compat-model',
      stream: true,
      system: 'Be concise.',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: '你好' }
      ]
    })
    expect(events).toEqual([{ type: 'text_delta', text: 'ok' }, { type: 'complete' }])
  })

  it('maps stream usage updates into normalized events', async () => {
    const fetchAnthropic = vi.fn().mockResolvedValue(
      createSseResponse(
        [
          'event: message_start',
          'data: {"type":"message_start","message":{"usage":{"input_tokens":3,"output_tokens":1}}}',
          '',
          'event: message_delta',
          'data: {"type":"message_delta","usage":{"output_tokens":4}}',
          '',
          ''
        ].join('\n')
      )
    )
    const agent = new CompatAnthropicMessagesAgent({
      fetchAnthropic,
      messages: [],
      model: 'claude-sonnet-4-5'
    })

    await expect(collectEvents(agent, 'hello')).resolves.toEqual([
      {
        type: 'usage_update',
        usage: {
          inputTokens: 3,
          outputTokens: 1,
          totalTokens: 4
        }
      },
      {
        type: 'usage_update',
        usage: {
          outputTokens: 4,
          totalTokens: 4
        }
      },
      { type: 'complete' }
    ])
  })

  it('returns provider error messages as agent errors', async () => {
    const fetchAnthropic = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid api key' } }), {
        status: 401
      })
    )
    const agent = new CompatAnthropicMessagesAgent({
      fetchAnthropic,
      messages: [],
      model: 'claude-sonnet-4-5'
    })

    await expect(collectEvents(agent, 'hello')).resolves.toEqual([
      {
        type: 'error',
        message: 'invalid api key'
      }
    ])
  })
})
