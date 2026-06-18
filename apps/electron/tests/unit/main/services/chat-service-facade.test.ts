// @vitest-environment node

/**
 * 负责验证 Electron main 的 ChatService 只保留门面职责。
 * 会话运行时行为由 server-core SessionManager 单测覆盖。
 */

import { describe, expect, it, vi } from 'vitest'

import { ChatService } from '@main/services/chat-service'
import type { SessionRecord } from '@moon/shared/domain/chat'

describe('ChatService facade', () => {
  it('forwards listSessions to the injected session runtime dependencies', async () => {
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
    const service = new ChatService({
      agentOperationsRepository: {} as never,
      messagesRepository: {} as never,
      sessionsRepository: { list } as never,
      settingsRepository: {} as never,
      threadsRepository: {} as never,
      toolInvocationsRepository: {} as never,
      topicsRepository: {} as never
    })

    await expect(service.listSessions()).resolves.toBe(sessions)
    expect(list).toHaveBeenCalledOnce()
  })
})
