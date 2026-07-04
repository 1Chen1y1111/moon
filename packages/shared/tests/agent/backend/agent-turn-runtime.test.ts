/**
 * 负责验证 AgentTurnRuntime 的单轮生命周期状态。
 * 测试只覆盖 turn-scoped abort、EventQueue、processing 和 pending restart，不触发 SDK。
 */

import { describe, expect, it } from 'vitest'

import { AgentTurnRuntime } from '../../../src/agent/backend/agent-turn-runtime'

describe('AgentTurnRuntime', () => {
  it('starts an active turn with an abort controller and event queue', () => {
    const runtime = new AgentTurnRuntime()
    const turn = runtime.start({ turnId: 'turn-1' })

    expect(runtime.isProcessing()).toBe(true)
    expect(runtime.eventQueue).toBe(turn.eventQueue)
    expect(runtime.turnId).toBe('turn-1')
    expect(turn.abortController.signal.aborted).toBe(false)
    expect(turn.eventQueue.isComplete).toBe(false)
  })

  it('bridges an already-aborted external signal into the active turn', () => {
    const runtime = new AgentTurnRuntime()
    const abortController = new AbortController()

    abortController.abort('cancelled')

    const turn = runtime.start({ abortSignal: abortController.signal })

    expect(turn.abortController.signal.aborted).toBe(true)
    expect(turn.abortController.signal.reason).toBe('cancelled')
  })

  it('bridges external aborts while a turn is active', () => {
    const runtime = new AgentTurnRuntime()
    const abortController = new AbortController()
    const turn = runtime.start({ abortSignal: abortController.signal })

    abortController.abort('cancelled')

    expect(turn.abortController.signal.aborted).toBe(true)
    expect(turn.abortController.signal.reason).toBe('cancelled')
  })

  it('ends a turn by completing the queue and clearing runtime state', () => {
    const runtime = new AgentTurnRuntime()
    const abortController = new AbortController()
    const turn = runtime.start({ abortSignal: abortController.signal, turnId: 'turn-1' })

    runtime.setPendingSourceActivationRestart({
      sourceSlug: 'linear',
      originalMessage: 'create issue'
    })
    runtime.end(turn)
    abortController.abort('late')

    expect(turn.eventQueue.isComplete).toBe(true)
    expect(turn.abortController.signal.aborted).toBe(false)
    expect(runtime.isProcessing()).toBe(false)
    expect(runtime.eventQueue).toBeNull()
    expect(runtime.turnId).toBeNull()
    expect(runtime.consumePendingSourceActivationRestart()).toBeNull()
  })

  it('aborts the active turn and clears runtime state', () => {
    const runtime = new AgentTurnRuntime()
    const turn = runtime.start({ turnId: 'turn-1' })

    runtime.setPendingSourceActivationRestart({
      sourceSlug: 'linear',
      originalMessage: 'create issue'
    })
    runtime.abort('stop')

    expect(turn.abortController.signal.aborted).toBe(true)
    expect(turn.abortController.signal.reason).toBe('stop')
    expect(turn.eventQueue.isComplete).toBe(true)
    expect(runtime.isProcessing()).toBe(false)
    expect(runtime.eventQueue).toBeNull()
    expect(runtime.turnId).toBeNull()
    expect(runtime.consumePendingSourceActivationRestart()).toBeNull()
  })

  it('destroys the active turn and clears runtime state', () => {
    const runtime = new AgentTurnRuntime()
    const turn = runtime.start({ turnId: 'turn-1' })

    runtime.destroy()

    expect(turn.abortController.signal.aborted).toBe(true)
    expect(turn.abortController.signal.reason).toBe('destroyed')
    expect(turn.eventQueue.isComplete).toBe(true)
    expect(runtime.isProcessing()).toBe(false)
    expect(runtime.eventQueue).toBeNull()
    expect(runtime.turnId).toBeNull()
  })

  it('keeps pending source activation restart first-writer-wins until consumed', () => {
    const runtime = new AgentTurnRuntime()

    runtime.start()
    runtime.setPendingSourceActivationRestart({
      sourceSlug: 'linear',
      originalMessage: 'create issue'
    })
    runtime.setPendingSourceActivationRestart({
      sourceSlug: 'github',
      originalMessage: 'open pull request'
    })

    expect(runtime.consumePendingSourceActivationRestart()).toEqual({
      sourceSlug: 'linear',
      originalMessage: 'create issue'
    })
    expect(runtime.consumePendingSourceActivationRestart()).toBeNull()
  })
})
