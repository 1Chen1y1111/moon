/**
 * 负责验证 agent session runtime state 的短生命周期内存语义。
 * 测试只覆盖纯状态 helper，不触发 SDK、权限等待或 source provider。
 */

import { describe, expect, it } from 'vitest'

import {
  addActivatedSourceSlug,
  clearProviderSessionId,
  createAgentSessionRuntimeState,
  hasActivatedSourceSlug,
  setProviderSessionId
} from '../../../src/agent'

describe('AgentSessionRuntimeState', () => {
  it('records activated sources idempotently', () => {
    const state = createAgentSessionRuntimeState()

    expect(addActivatedSourceSlug(state, 'linear')).toBe('linear')
    expect(addActivatedSourceSlug(state, 'linear')).toBe('linear')

    expect(state.activatedSourceSlugs).toEqual(['linear'])
    expect(hasActivatedSourceSlug(state.activatedSourceSlugs, 'linear')).toBe(true)
  })

  it('keeps different activated source slugs independent', () => {
    const state = createAgentSessionRuntimeState()

    addActivatedSourceSlug(state, 'linear')
    addActivatedSourceSlug(state, 'github')

    expect(state.activatedSourceSlugs).toEqual(['linear', 'github'])
    expect(hasActivatedSourceSlug(state.activatedSourceSlugs, 'docs')).toBe(false)
  })

  it('records the provider session id for later turn resume', () => {
    const state = createAgentSessionRuntimeState()

    expect(setProviderSessionId(state, 'sdk-session-1')).toBe('sdk-session-1')
    expect(state.providerSessionId).toBe('sdk-session-1')
  })

  it('clears the provider session id without replacing the runtime state', () => {
    const state = createAgentSessionRuntimeState()

    setProviderSessionId(state, 'sdk-session-1')
    clearProviderSessionId(state)

    expect(state.providerSessionId).toBeUndefined()
  })
})
