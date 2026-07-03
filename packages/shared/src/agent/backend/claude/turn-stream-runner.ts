/**
 * 负责把 Claude SDK 事件流和 Moon 内部事件队列合流为单轮 AgentEvent。
 * 它不构造 prompt、SDK options 或权限规则，只处理 turn 内事件编排。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

import type { PendingSourceActivationRestart } from '../../source-activation-drain'
import { SourceActivationDrainController } from '../../source-activation-drain'
import type { EventQueue } from '../event-queue'
import type { AgentEvent } from '../types'
import type { ClaudeEventAdapter } from './event-adapter'

type ToolResultAgentEvent = Extract<AgentEvent, { type: 'tool_result' }>

type SdkEventResult = IteratorResult<SDKMessage, void>
type QueuedEventResult = IteratorResult<AgentEvent, void>

export type ClaudeTurnStreamRunnerInput = {
  sdkEvents: AsyncIterable<SDKMessage>
  eventQueue: EventQueue
  eventAdapter: ClaudeEventAdapter
  normalizeAgentEvent: (event: AgentEvent) => AgentEvent
  handleToolResultError: (event: ToolResultAgentEvent) => void | Promise<void>
  consumePendingSourceActivationRestart: () => PendingSourceActivationRestart | null
}

/**
 * 编排 Claude SDK 事件和 Moon 内部队列事件，保持权限审批和 source activation 的 turn 顺序。
 */
export class ClaudeTurnStreamRunner {
  private readonly consumePendingSourceActivationRestart: () => PendingSourceActivationRestart | null
  private readonly eventAdapter: ClaudeEventAdapter
  private readonly eventQueue: EventQueue
  private readonly handleToolResultError: (event: ToolResultAgentEvent) => void | Promise<void>
  private readonly normalizeAgentEvent: (event: AgentEvent) => AgentEvent
  private readonly sdkEvents: AsyncIterable<SDKMessage>

  /**
   * 保存本轮事件合流所需的 SDK 事件源、内部队列和事件处理回调。
   */
  constructor({
    consumePendingSourceActivationRestart,
    eventAdapter,
    eventQueue,
    handleToolResultError,
    normalizeAgentEvent,
    sdkEvents
  }: ClaudeTurnStreamRunnerInput) {
    this.consumePendingSourceActivationRestart = consumePendingSourceActivationRestart
    this.eventAdapter = eventAdapter
    this.eventQueue = eventQueue
    this.handleToolResultError = handleToolResultError
    this.normalizeAgentEvent = normalizeAgentEvent
    this.sdkEvents = sdkEvents
  }

  /**
   * 运行单轮事件合流；SDK 流结束时关闭队列、flush 队列事件，并在需要时补 complete。
   */
  async *run(): AsyncGenerator<AgentEvent, void, void> {
    let hasCompleteEvent = false
    let eventQueueCompleted = false
    const sourceActivationDrain = new SourceActivationDrainController('batch-boundary')
    const sdkEvents = this.sdkEvents[Symbol.asyncIterator]()
    const queuedEvents = this.eventQueue.drain()
    const completeEventQueue = (): void => {
      if (!eventQueueCompleted) {
        eventQueueCompleted = true
        this.eventQueue.complete()
      }
    }
    let sdkEventResultPromise = sdkEvents.next()
    let queuedEventResultPromise: Promise<QueuedEventResult> | null = queuedEvents.next()

    try {
      while (true) {
        const raceCandidates: Array<
          Promise<
            | { type: 'sdk'; result: SdkEventResult }
            | { type: 'queue'; result: QueuedEventResult }
          >
        > = [sdkEventResultPromise.then((result) => ({ type: 'sdk' as const, result }))]

        if (queuedEventResultPromise !== null) {
          raceCandidates.push(
            queuedEventResultPromise.then((result) => ({ type: 'queue' as const, result }))
          )
        }

        const result = await Promise.race(raceCandidates)

        if (result.type === 'queue') {
          if (result.result.done === true) {
            queuedEventResultPromise = null
            continue
          }

          if (result.result.value.type === 'complete') {
            hasCompleteEvent = true
          }

          yield result.result.value
          queuedEventResultPromise = queuedEvents.next()
          continue
        }

        if (result.result.done) {
          completeEventQueue()
          break
        }

        sdkEventResultPromise = sdkEvents.next()

        for (const agentEvent of this.eventAdapter.adapt(result.result.value)) {
          const normalizedEvent = this.normalizeAgentEvent(agentEvent)

          if (normalizedEvent.type === 'complete') {
            hasCompleteEvent = true
          }

          if (normalizedEvent.type === 'tool_result' && normalizedEvent.isError) {
            await this.handleToolResultError(normalizedEvent)
          }

          if (
            sourceActivationDrain.observe(normalizedEvent, () =>
              this.consumePendingSourceActivationRestart()
            )
          ) {
            continue
          }

          yield normalizedEvent
        }

        const sourceActivatedEvent = sourceActivationDrain.shouldFireAtBoundary()

        if (sourceActivatedEvent !== null) {
          completeEventQueue()
          yield this.eventAdapter.withCurrentTurnId(sourceActivatedEvent)
          return
        }
      }

      if (queuedEventResultPromise !== null) {
        let queuedResult = await queuedEventResultPromise

        while (queuedResult.done !== true) {
          if (queuedResult.value.type === 'complete') {
            hasCompleteEvent = true
          }

          yield queuedResult.value
          queuedResult = await queuedEvents.next()
        }
      }

      if (!hasCompleteEvent) {
        yield { type: 'complete' }
      }
    } finally {
      completeEventQueue()
    }
  }
}
