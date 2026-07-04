/**
 * 负责 agent backend 单轮执行的运行时状态。
 * 它只管理 active turn、AbortController、EventQueue 和 turn-scoped pending 状态。
 */

import type { PendingSourceActivationRestart } from '../source-activation-drain'
import { EventQueue } from './event-queue'
import type { AgentChatOptions } from './types'

/**
 * 描述一次 active agent turn 持有的取消、事件队列和外部 abort 清理句柄。
 */
export type AgentTurnState = {
  abortController: AbortController
  eventQueue: EventQueue
  cleanupExternalAbort: () => void
  turnId: string | null
}

/**
 * 集中维护 BaseAgent 的 turn-scoped 生命周期状态。
 */
export class AgentTurnRuntime {
  private activeTurn: AgentTurnState | null = null
  private pendingSourceActivationRestart: PendingSourceActivationRestart | null = null

  /**
   * 启动一次 agent turn，并把外部 abort signal 桥接到内部 AbortController。
   */
  start(options: AgentChatOptions = {}): AgentTurnState {
    const abortController = new AbortController()
    const eventQueue = new EventQueue()
    const turnId = options.turnId ?? null
    const relayAbort = (): void => abortController.abort(options.abortSignal?.reason)
    const turn: AgentTurnState = {
      abortController,
      eventQueue,
      turnId,
      cleanupExternalAbort: () => options.abortSignal?.removeEventListener('abort', relayAbort)
    }

    this.activeTurn = turn
    this.pendingSourceActivationRestart = null

    if (options.abortSignal?.aborted) {
      relayAbort()
    } else {
      options.abortSignal?.addEventListener('abort', relayAbort, { once: true })
    }

    return turn
  }

  /**
   * 结束一次 turn，完成队列并清理 active turn 引用。
   */
  end(turn: AgentTurnState): void {
    turn.cleanupExternalAbort()
    turn.eventQueue.complete()

    if (this.activeTurn === turn) {
      this.activeTurn = null
      this.pendingSourceActivationRestart = null
    }
  }

  /**
   * 中止当前 active turn，并释放 runtime 持有的 turn-scoped 状态。
   */
  abort(reason?: string): void {
    this.activeTurn?.abortController.abort(reason)
    this.activeTurn?.eventQueue.complete()
    this.clear()
  }

  /**
   * 销毁当前 active turn，用于 backend 被替换或会话结束。
   */
  destroy(): void {
    this.activeTurn?.abortController.abort('destroyed')
    this.activeTurn?.eventQueue.complete()
    this.clear()
  }

  /**
   * 返回当前是否存在 active turn。
   */
  isProcessing(): boolean {
    return this.activeTurn !== null
  }

  /**
   * 返回当前 active turn 的事件队列；没有 active turn 时返回 null。
   */
  get eventQueue(): EventQueue | null {
    return this.activeTurn?.eventQueue ?? null
  }

  /**
   * 返回当前 active turn id；未绑定或没有 active turn 时返回 null。
   */
  get turnId(): string | null {
    return this.activeTurn?.turnId ?? null
  }

  /**
   * 记录等待 source activation drain 的 restart 信号；同一 turn 内保持 first-writer-wins。
   */
  setPendingSourceActivationRestart(pending: PendingSourceActivationRestart): void {
    if (this.pendingSourceActivationRestart !== null) {
      return
    }

    this.pendingSourceActivationRestart = pending
  }

  /**
   * 消费并清空 pending source activation restart。
   */
  consumePendingSourceActivationRestart(): PendingSourceActivationRestart | null {
    const pending = this.pendingSourceActivationRestart

    this.pendingSourceActivationRestart = null

    return pending
  }

  /**
   * 清空 active turn 和 turn-scoped pending 状态。
   */
  private clear(): void {
    this.activeTurn = null
    this.pendingSourceActivationRestart = null
  }
}
