// @vitest-environment node

/**
 * 负责验证 legacy RPC event bridge 会把 shared RPC event 映射回旧 IPC event。
 * 测试只覆盖 Electron main 内部事件分发，不触发真实窗口或 renderer。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  }
}))

describe('emitLegacyRpcEvent', () => {
  beforeEach(() => {
    getAllWindowsMock.mockReset()
  })

  it('maps settings and projects RPC events to legacy IPC event broadcasts', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { emitLegacyRpcEvent } = await import('@main/bootstrap/legacy-rpc-event-bridge')
    const firstWebContents = { send: vi.fn() }
    const secondWebContents = { send: vi.fn() }
    const settings = createDefaultAppSettings()
    const projectEvent = { projects: [], activeProject: null }

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    emitLegacyRpcEvent(RPC_CHANNELS.settings.onChange, { to: 'all' }, settings)
    emitLegacyRpcEvent(RPC_CHANNELS.projects.onChange, { to: 'all' }, projectEvent)

    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.projects.onChange, projectEvent)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.projects.onChange, projectEvent)
  })

  it('maps window RPC events to the selected webContents legacy IPC event', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { emitLegacyRpcEvent } = await import('@main/bootstrap/legacy-rpc-event-bridge')
    const sender = { send: vi.fn() }
    const payload = { isMaximized: true }

    emitLegacyRpcEvent(RPC_CHANNELS.window.onStateChange, { to: 'webContents', sender }, payload)

    expect(sender.send).toHaveBeenCalledWith(ipcChannels.window.onStateChange, payload)
    expect(getAllWindowsMock).not.toHaveBeenCalled()
  })

  it('maps session:event to the selected webContents legacy IPC event', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { emitLegacyRpcEvent } = await import('@main/bootstrap/legacy-rpc-event-bridge')
    const sender = { send: vi.fn() }
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    emitLegacyRpcEvent(RPC_CHANNELS.sessions.event, { to: 'webContents', sender }, event)

    expect(sender.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, event)
    expect(getAllWindowsMock).not.toHaveBeenCalled()
  })

  it('throws a clear error for unsupported RPC event channels', async () => {
    const { emitLegacyRpcEvent } = await import('@main/bootstrap/legacy-rpc-event-bridge')
    const unsafeEmitLegacyRpcEvent = emitLegacyRpcEvent as unknown as (
      channel: string,
      target: { to: 'all' },
      ...args: unknown[]
    ) => void

    expect(() => unsafeEmitLegacyRpcEvent('sessions:listSessions', { to: 'all' })).toThrow(
      'Unsupported legacy RPC event channel: sessions:listSessions'
    )
  })
})
