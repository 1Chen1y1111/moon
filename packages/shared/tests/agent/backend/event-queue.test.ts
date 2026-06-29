/**
 * 负责验证 agent backend EventQueue 的异步 drain 生命周期。
 * 测试只覆盖队列交付语义，不涉及具体 provider、会话持久化或 UI 广播。
 */

import { describe, expect, it } from 'vitest'

import { EventQueue } from '../../../src/agent/backend/event-queue'
import type { AgentEvent } from '../../../src/agent'

/**
 * 创建最小文本增量事件，便于断言队列顺序。
 */
function textDelta(text: string): AgentEvent {
  return { type: 'text_delta', text }
}

/**
 * 消费完整 drain 流并收集事件。
 */
async function collectDrain(queue: EventQueue): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []

  for await (const event of queue.drain()) {
    events.push(event)
  }

  return events
}

describe('EventQueue', () => {
  it('drains enqueued events in order', async () => {
    const queue = new EventQueue()

    queue.enqueue(textDelta('hello'))
    queue.enqueue(textDelta(' world'))
    queue.complete()

    await expect(collectDrain(queue)).resolves.toEqual([
      { type: 'text_delta', text: 'hello' },
      { type: 'text_delta', text: ' world' }
    ])
  })

  it('waits for async enqueue while drain is active', async () => {
    const queue = new EventQueue()
    const drainPromise = collectDrain(queue)

    await new Promise((resolve) => setTimeout(resolve, 0))

    queue.enqueue(textDelta('delayed'))
    queue.complete()

    await expect(drainPromise).resolves.toEqual([{ type: 'text_delta', text: 'delayed' }])
  })

  it('finishes drain when completed without events', async () => {
    const queue = new EventQueue()

    queue.complete()

    await expect(collectDrain(queue)).resolves.toEqual([])
    expect(queue.isComplete).toBe(true)
  })

  it('resets pending events and completion state for a fresh turn', async () => {
    const queue = new EventQueue()

    queue.enqueue(textDelta('stale'))
    queue.complete()

    expect(queue.hasPending).toBe(true)
    expect(queue.isComplete).toBe(true)

    queue.reset()

    expect(queue.hasPending).toBe(false)
    expect(queue.isComplete).toBe(false)

    queue.enqueue(textDelta('fresh'))
    queue.complete()

    await expect(collectDrain(queue)).resolves.toEqual([{ type: 'text_delta', text: 'fresh' }])
  })

  it('allows complete to be called multiple times', async () => {
    const queue = new EventQueue()

    queue.enqueue(textDelta('only'))
    queue.complete()
    queue.complete()

    await expect(collectDrain(queue)).resolves.toEqual([{ type: 'text_delta', text: 'only' }])
  })

  it('drains events enqueued after complete when drain has not consumed them yet', async () => {
    const queue = new EventQueue()

    queue.complete()
    queue.enqueue(textDelta('late'))

    await expect(collectDrain(queue)).resolves.toEqual([{ type: 'text_delta', text: 'late' }])
  })
})
