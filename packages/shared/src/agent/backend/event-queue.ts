/**
 * 负责在 SDK hook 或子运行时需要插队时缓存 agent 事件。
 * 它只提供轻量队列语义，不处理事件适配、持久化或 UI 广播。
 */

import type { AgentEvent } from './types'

/**
 * 桥接异步事件生产者和 agent chat 事件流消费者。
 */
export class EventQueue {
  private events: AgentEvent[] = []
  private completeRequested = false
  private waiters: Array<(done: boolean) => void> = []

  /**
   * 推入一个需要优先交给会话编排层处理的 agent 事件，并唤醒等待中的 drain。
   */
  enqueue(event: AgentEvent): void {
    this.events.push(event)
    this.signal(false)
  }

  /**
   * 标记当前 turn 的队列事件已经结束，并唤醒所有等待中的 drain。
   */
  complete(): void {
    this.completeRequested = true
    this.signal(true)
  }

  /**
   * 为下一次 turn 重置队列状态，丢弃旧事件和旧等待者。
   */
  reset(): void {
    this.events = []
    this.waiters = []
    this.completeRequested = false
  }

  /**
   * 按入队顺序产出事件，直到 complete() 被调用且队列已清空。
   */
  async *drain(): AsyncGenerator<AgentEvent, void, void> {
    while (true) {
      const done = await this.waitForEvent()

      while (this.events.length > 0) {
        yield this.events.shift()!
      }

      if (done) {
        break
      }
    }
  }

  /**
   * 表示当前队列里是否还有尚未交付给消费者的事件。
   */
  get hasPending(): boolean {
    return this.events.length > 0
  }

  /**
   * 表示当前 turn 是否已经声明不会再产生新的队列事件。
   */
  get isComplete(): boolean {
    return this.completeRequested
  }

  /**
   * 唤醒所有等待中的 drain 消费者。
   */
  private signal(done: boolean): void {
    const waiters = this.waiters.splice(0)

    for (const waiter of waiters) {
      waiter(done)
    }
  }

  /**
   * 等待事件入队或 turn 完成；返回 true 表示队列已完成且当前没有待交付事件。
   */
  private waitForEvent(): Promise<boolean> {
    if (this.events.length > 0 || this.completeRequested) {
      return Promise.resolve(this.completeRequested && this.events.length === 0)
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }
}
