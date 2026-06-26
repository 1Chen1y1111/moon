/**
 * 负责在 SDK hook 或子运行时需要插队时缓存 agent 事件。
 * 它只提供轻量队列语义，不处理事件适配、持久化或 UI 广播。
 */

import type { AgentEvent } from './types'

/**
 * 桥接异步事件生产者和 agent chat 事件流消费者。
 */
export class EventQueue {
  private readonly events: AgentEvent[] = []
  private readonly waiters: Array<(event: AgentEvent) => void> = []

  /**
   * 推入一个需要优先交给会话编排层处理的 agent 事件。
   */
  push(event: AgentEvent): void {
    const waiter = this.waiters.shift()

    if (waiter !== undefined) {
      waiter(event)
      return
    }

    this.events.push(event)
  }

  /**
   * 读取下一条已排队事件；没有事件时等待后续事件推入。
   */
  next(): Promise<AgentEvent> {
    const event = this.events.shift()

    if (event !== undefined) {
      return Promise.resolve(event)
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }
}
