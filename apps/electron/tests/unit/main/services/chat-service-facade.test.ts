// @vitest-environment node

/**
 * 负责验证 @moon/server 的 ChatService 只保留门面职责。
 * 会话运行时行为由 server-core SessionManager 单测覆盖。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionRecord } from '@moon/shared/domain/chat'

describe('ChatService facade', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@moon/server-core/sessions')
  })

  it('forwards listSessions through server-core session handlers', async () => {
    const sessions: SessionRecord[] = [
      {
        id: 'session-1',
        projectId: null,
        provider: 'claude',
        title: 'Moon',
        status: 'active',
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:00:00.000Z'
      }
    ]
    const list = vi.fn(async () => sessions)
    const sessionManager = {}
    const SessionManager = vi.fn(function MockSessionManager() {
      return sessionManager
    })
    const createSessionHandlers = vi.fn(() => ({
      listSessions: list
    }))
    const dependencies = {
      agentOperationsRepository: {} as never,
      messagesRepository: {} as never,
      sessionsRepository: {} as never,
      settingsRepository: {} as never,
      threadsRepository: {} as never,
      toolInvocationsRepository: {} as never,
      topicsRepository: {} as never
    }

    vi.doMock('@moon/server-core/sessions', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@moon/server-core/sessions')>()

      return {
        ...actual,
        SessionManager,
        createSessionHandlers
      }
    })

    const { ChatService } = await import('@moon/server/services/chat-service')
    const { WorkspaceSourceProvider } = await import('@moon/server/sources/workspace-source-provider')

    const service = new ChatService(dependencies)

    expect(SessionManager).toHaveBeenCalledWith({
      ...dependencies,
      sourceProvider: expect.any(WorkspaceSourceProvider)
    })
    expect(createSessionHandlers).toHaveBeenCalledWith({ sessionManager })

    await expect(service.listSessions()).resolves.toBe(sessions)
    expect(list).toHaveBeenCalledOnce()
  })
})
