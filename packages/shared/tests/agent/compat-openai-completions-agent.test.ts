/**
 * 负责验证 CompatOpenAiCompletionsAgent 的 HTTP 请求和 SSE 事件转换。
 * 测试使用 mock fetch，不触发真实 provider 网络请求。
 */

import { describe, expect, it, vi } from 'vitest'

import { CompatOpenAiCompletionsAgent } from '../../src/agent'
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
  agent: CompatOpenAiCompletionsAgent,
  message: string
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []

  for await (const event of agent.chat(message)) {
    events.push(event)
  }

  return events
}

describe('CompatOpenAiCompletionsAgent', () => {
  it('posts messages to the OpenAI-compatible chat completions stream endpoint', async () => {
    const fetchOpenAi = vi
      .fn()
      .mockResolvedValue(
        createSseResponse(
          [
            'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}',
            '',
            'data: {"choices":[{"delta":{"content":"好"},"finish_reason":null}]}',
            '',
            'data: [DONE]',
            '',
            ''
          ].join('\n')
        )
      )
    const agent = new CompatOpenAiCompletionsAgent({
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      fetchOpenAi,
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' }
      ],
      model: 'deepseek-v4-flash'
    })

    const events = await collectEvents(agent, '你好')
    const [, request] = fetchOpenAi.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(request.body))

    expect(fetchOpenAi).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer sk-test'
        })
      })
    )
    expect(body).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: true,
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: '你好' }
      ]
    })
    expect(events).toEqual([
      { type: 'text_delta', text: '你' },
      { type: 'text_delta', text: '好' },
      { type: 'complete' }
    ])
  })

  it('maps stream usage updates into normalized events', async () => {
    const fetchOpenAi = vi
      .fn()
      .mockResolvedValue(
        createSseResponse(
          [
            'data: {"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7},"choices":[]}',
            '',
            ''
          ].join('\n')
        )
      )
    const agent = new CompatOpenAiCompletionsAgent({
      fetchOpenAi,
      messages: [],
      model: 'deepseek-v4-flash'
    })

    await expect(collectEvents(agent, 'hello')).resolves.toEqual([
      {
        type: 'usage_update',
        usage: {
          inputTokens: 3,
          outputTokens: 4,
          totalTokens: 7
        }
      },
      { type: 'complete' }
    ])
  })

  it('returns provider error messages as agent errors', async () => {
    const fetchOpenAi = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid api key' } }), {
        status: 401
      })
    )
    const agent = new CompatOpenAiCompletionsAgent({
      fetchOpenAi,
      messages: [],
      model: 'deepseek-v4-flash'
    })

    await expect(collectEvents(agent, 'hello')).resolves.toEqual([
      {
        type: 'error',
        message: 'invalid api key'
      }
    ])
  })
})
