/**
 * 负责控制 source activation 信号在工具结果批次 drain 完后再发出。
 * 它只处理纯 AgentEvent 和 pending 状态，不触发 abort、重试或真实 source 激活。
 */

import type { AgentEvent, AgentSourceActivationRestart } from './backend/types'

export type PendingSourceActivationRestart = AgentSourceActivationRestart

export type SourceActivationDrainPolicy = 'batch-boundary'

type SourceActivatedEvent = Extract<AgentEvent, { type: 'source_activated' }>

/**
 * 按 Craft 的 batch-boundary 策略捕获 pending source activation，并在批次边界发出事件。
 */
export class SourceActivationDrainController {
  private captured: PendingSourceActivationRestart | null = null
  private fired = false

  /**
   * 创建 source activation drain controller；当前 Moon 只支持 Claude 批次边界策略。
   */
  constructor(private readonly policy: SourceActivationDrainPolicy = 'batch-boundary') {}

  /**
   * 观察即将 yield 的事件；捕获 pending 后，当前批次剩余事件都进入 drain 模式。
   */
  observe(
    event: AgentEvent,
    consumePending: () => PendingSourceActivationRestart | null
  ): boolean {
    if (this.policy !== 'batch-boundary' || this.fired) {
      return false
    }

    if (this.captured !== null) {
      if (event.type === 'tool_result') {
        consumePending()
      }

      return true
    }

    if (event.type !== 'tool_result') {
      return false
    }

    const pending = consumePending()

    if (pending === null) {
      return false
    }

    this.captured = pending
    return true
  }

  /**
   * 在批次边界产出 source_activated；首次产出后保持幂等。
   */
  shouldFireAtBoundary(): SourceActivatedEvent | null {
    if (this.captured === null || this.fired) {
      return null
    }

    this.fired = true

    return {
      type: 'source_activated',
      sourceSlug: this.captured.sourceSlug,
      originalMessage: this.captured.originalMessage
    }
  }

  /**
   * 返回当前捕获到的 source slug，方便后续接入点做诊断或测试。
   */
  get capturedSlug(): string | null {
    return this.captured?.sourceSlug ?? null
  }

  /**
   * 返回是否已经发出 source_activated，避免调用方重复触发中断流程。
   */
  get hasFired(): boolean {
    return this.fired
  }
}
