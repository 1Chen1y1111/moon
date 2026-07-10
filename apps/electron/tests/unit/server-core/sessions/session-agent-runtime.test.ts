// @vitest-environment node

/**
 * 负责验证 SessionAgentRuntime 的 backend 创建上下文编排。
 * 测试只覆盖 server-core 运行态边界，不触发 Electron、IPC、数据库或真实 SDK。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  SessionAgentRuntime,
  type SessionPermissionModeResolver,
  type SessionSourceActivator,
  type SessionSourceProvider,
  type SessionSourceProviderScope
} from '@moon/server-core/sessions'
import { setProviderSessionId } from '@moon/shared/agent'
import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  AgentSourceRecord
} from '@moon/shared/agent'
import { createDefaultLlmConnection } from '@moon/shared/config'
import type { SessionRecord, ThreadRecord, TopicRecord } from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'

const timestamp = '2026-05-09T00:00:00.000Z'
const connection = {
  ...createDefaultLlmConnection('anthropic'),
  id: 'connection-1',
  name: 'Claude',
  apiKey: 'test-key'
}

/**
 * 创建满足 AgentBackend contract 的最小 backend fixture。
 */
function createBackend(overrides: Partial<AgentBackend> = {}): AgentBackend {
  return {
    async *chat(): AsyncGenerator<AgentEvent, void, void> {
      yield { type: 'complete' }
    },
    abort: vi.fn(async () => undefined),
    destroy: vi.fn(),
    getModel: vi.fn(() => 'claude-sonnet-4-6'),
    isProcessing: vi.fn(() => false),
    respondToPermission: vi.fn(),
    setModel: vi.fn(),
    ...overrides
  }
}

/**
 * 创建会话运行态测试所需的最小 scope。
 */
function createScope(
  threadId = 'thread-1',
  metadata?: ThreadRecord['metadata']
): SessionSourceProviderScope {
  const project: ProjectRecord = {
    id: 'project-1',
    name: 'moon',
    path: '/workspace/moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const session: SessionRecord = {
    id: 'session-1',
    projectId: project.id,
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const topic: TopicRecord = {
    id: 'topic-1',
    sessionId: session.id,
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const thread: ThreadRecord = {
    id: threadId,
    topicId: topic.id,
    title: '主线',
    type: 'standalone',
    ...(metadata === undefined ? {} : { metadata }),
    createdAt: timestamp,
    updatedAt: timestamp
  }

  return {
    project,
    session,
    topic,
    thread
  }
}

describe('SessionAgentRuntime', () => {
  it('reuses agent session runtime state by thread and isolates different threads', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const runtime = new SessionAgentRuntime({
      createAgentBackend: vi.fn((config) => {
        capturedConfigs.push(config)

        return createBackend()
      })
    })

    const first = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'hello',
      scope: createScope('thread-1')
    })
    const second = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'hello again',
      scope: createScope('thread-1')
    })
    const third = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'other thread',
      scope: createScope('thread-2')
    })

    expect(first.agentSessionState).toBe(second.agentSessionState)
    expect(third.agentSessionState).not.toBe(first.agentSessionState)
    expect(capturedConfigs[0]?.permissionMode).toBe('ask')

    setProviderSessionId(first.agentSessionState, 'sdk-session-1')

    const resumed = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'resumed turn',
      scope: createScope('thread-1')
    })

    expect(resumed.agentSessionState.providerSessionId).toBe('sdk-session-1')
    expect(third.agentSessionState.providerSessionId).toBeUndefined()
  })

  it('hydrates provider session state from thread metadata without overwriting newer memory', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const runtime = new SessionAgentRuntime({
      createAgentBackend: vi.fn((config) => {
        capturedConfigs.push(config)

        return createBackend()
      })
    })

    const first = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'resume after restart',
      scope: createScope('thread-persisted', {
        providerSessionId: 'sdk-session-persisted'
      })
    })

    expect(first.agentSessionState.providerSessionId).toBe('sdk-session-persisted')
    expect(capturedConfigs[0]?.agentSessionState?.providerSessionId).toBe(
      'sdk-session-persisted'
    )

    runtime.recordProviderSessionId('thread-persisted', 'sdk-session-current')

    const second = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'keep current state',
      scope: createScope('thread-persisted', {
        providerSessionId: 'sdk-session-stale'
      })
    })

    expect(second.agentSessionState.providerSessionId).toBe('sdk-session-current')
  })

  it('ignores missing, empty, or non-string provider session metadata', async () => {
    const runtime = new SessionAgentRuntime({
      createAgentBackend: vi.fn(() => createBackend())
    })

    const missing = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'missing metadata',
      scope: createScope('thread-missing')
    })
    const empty = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'empty metadata',
      scope: createScope('thread-empty', { providerSessionId: '   ' })
    })
    const invalid = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'invalid metadata',
      scope: createScope('thread-invalid', { providerSessionId: 42 })
    })

    expect(missing.agentSessionState.providerSessionId).toBeUndefined()
    expect(empty.agentSessionState.providerSessionId).toBeUndefined()
    expect(invalid.agentSessionState.providerSessionId).toBeUndefined()
  })

  it.each(['safe', 'allow-all'] as const)(
    'passes resolved %s permission mode to backend config',
    async (permissionMode) => {
      const capturedConfigs: AgentBackendConfig[] = []
      const permissionModeResolver: SessionPermissionModeResolver = {
        resolvePermissionMode: vi.fn(async (scope) => {
          expect(scope.project?.id).toBe('project-1')
          expect(scope.topic.sessionId).toBe(scope.session.id)
          expect(scope.thread.topicId).toBe(scope.topic.id)

          return permissionMode
        })
      }
      const runtime = new SessionAgentRuntime({
        createAgentBackend: vi.fn((config) => {
          capturedConfigs.push(config)

          return createBackend()
        }),
        permissionModeResolver
      })

      await runtime.createBackend({
        connection,
        messages: [],
        originalMessage: 'hello',
        scope: createScope(`thread-${permissionMode}`)
      })

      expect(permissionModeResolver.resolvePermissionMode).toHaveBeenCalledTimes(1)
      expect(capturedConfigs[0]?.permissionMode).toBe(permissionMode)
    }
  )

  it('marks activated known sources active without injecting unknown sources', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const sources: AgentSourceRecord[] = [
      {
        slug: 'linear',
        name: 'Linear',
        description: 'Linear issues',
        status: 'inactive',
        error: 'not connected'
      }
    ]
    const sourceProvider: SessionSourceProvider = {
      resolveSources: vi.fn(async () => sources)
    }
    const runtime = new SessionAgentRuntime({
      createAgentBackend: vi.fn((config) => {
        capturedConfigs.push(config)

        return createBackend()
      }),
      sourceProvider
    })

    runtime.recordActivatedSource('thread-1', 'linear')
    runtime.recordActivatedSource('thread-1', 'unknown')

    await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'create issue',
      scope: createScope('thread-1')
    })

    expect(sourceProvider.resolveSources).toHaveBeenCalledTimes(1)
    expect(capturedConfigs[0]?.agentSessionState?.activatedSourceSlugs).toEqual([
      'linear',
      'unknown'
    ])
    expect(capturedConfigs[0]?.sources).toEqual([
      {
        slug: 'linear',
        name: 'Linear',
        description: 'Linear issues',
        status: 'active'
      }
    ])
    expect(capturedConfigs[0]?.sources?.some((source) => source.slug === 'unknown')).toBe(false)
  })

  it('records activated sources and pending restart when source activation succeeds', async () => {
    const setPendingSourceActivationRestart = vi.fn()
    const backend = createBackend({ setPendingSourceActivationRestart })
    const scope = createScope('thread-activation')
    const sourceActivator: SessionSourceActivator = {
      activateSource: vi.fn(async () => true)
    }
    const runtime = new SessionAgentRuntime({
      createAgentBackend: vi.fn(() => backend),
      sourceActivator
    })

    const result = await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'create linear issue',
      scope
    })
    const activated = await backend.onSourceActivationRequest?.('linear')

    expect(activated).toBe(true)
    expect(sourceActivator.activateSource).toHaveBeenCalledWith(scope, 'linear')
    expect(result.agentSessionState.activatedSourceSlugs).toEqual(['linear'])
    expect(setPendingSourceActivationRestart).toHaveBeenCalledWith({
      sourceSlug: 'linear',
      originalMessage: 'create linear issue'
    })
  })

  it('does not record source activation when activation fails or runtime pieces are missing', async () => {
    const setPendingSourceActivationRestart = vi.fn()
    const failedActivator: SessionSourceActivator = {
      activateSource: vi.fn(async () => false)
    }
    const failedBackend = createBackend({ setPendingSourceActivationRestart })
    const failedRuntime = new SessionAgentRuntime({
      createAgentBackend: vi.fn(() => failedBackend),
      sourceActivator: failedActivator
    })
    const failedResult = await failedRuntime.createBackend({
      connection,
      messages: [],
      originalMessage: 'create issue',
      scope: createScope('thread-failed')
    })

    expect(await failedBackend.onSourceActivationRequest?.('linear')).toBe(false)
    expect(failedResult.agentSessionState.activatedSourceSlugs).toEqual([])
    expect(setPendingSourceActivationRestart).not.toHaveBeenCalled()

    const missingActivatorBackend = createBackend({ setPendingSourceActivationRestart })
    const missingActivatorRuntime = new SessionAgentRuntime({
      createAgentBackend: vi.fn(() => missingActivatorBackend)
    })
    const missingActivatorResult = await missingActivatorRuntime.createBackend({
      connection,
      messages: [],
      originalMessage: 'create issue',
      scope: createScope('thread-missing-activator')
    })

    expect(await missingActivatorBackend.onSourceActivationRequest?.('linear')).toBe(false)
    expect(missingActivatorResult.agentSessionState.activatedSourceSlugs).toEqual([])

    const skippedActivator: SessionSourceActivator = {
      activateSource: vi.fn(async () => true)
    }
    const missingPendingBackend = createBackend()
    const missingPendingRuntime = new SessionAgentRuntime({
      createAgentBackend: vi.fn(() => missingPendingBackend),
      sourceActivator: skippedActivator
    })
    const missingPendingResult = await missingPendingRuntime.createBackend({
      connection,
      messages: [],
      originalMessage: 'create issue',
      scope: createScope('thread-missing-pending')
    })

    expect(await missingPendingBackend.onSourceActivationRequest?.('linear')).toBe(false)
    expect(skippedActivator.activateSource).not.toHaveBeenCalled()
    expect(missingPendingResult.agentSessionState.activatedSourceSlugs).toEqual([])
  })

  it('disables session callbacks after release', async () => {
    const backend = createBackend({ setPendingSourceActivationRestart: vi.fn() })
    const sourceActivator: SessionSourceActivator = {
      activateSource: vi.fn(async () => true)
    }
    const scope = createScope('thread-release')
    const runtime = new SessionAgentRuntime({
      createAgentBackend: vi.fn(() => backend),
      sourceActivator
    })

    await runtime.createBackend({
      connection,
      messages: [],
      originalMessage: 'create issue',
      scope
    })
    runtime.releaseSessionCallbacks(scope.session.id)

    expect(await backend.onSourceActivationRequest?.('linear')).toBe(false)
    expect(sourceActivator.activateSource).not.toHaveBeenCalled()
  })
})
