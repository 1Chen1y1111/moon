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
    const firstWebContents = { id: 101, send: vi.fn() }
    const secondWebContents = { id: 102, send: vi.fn() }
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

  it('maps workspace RPC event targets to clients bound to that workspace', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { emitLegacyRpcEvent } = await import('@main/bootstrap/legacy-rpc-event-bridge')
    const { bindLegacyWebContentsClientWorkspace } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const firstWebContents = { id: 201, send: vi.fn() }
    const secondWebContents = { id: 202, send: vi.fn() }
    const thirdWebContents = { id: 203, send: vi.fn() }
    const settings = createDefaultAppSettings()

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents },
      { webContents: thirdWebContents }
    ])
    bindLegacyWebContentsClientWorkspace(firstWebContents, 'workspace-1')
    bindLegacyWebContentsClientWorkspace(secondWebContents, 'workspace-1')
    bindLegacyWebContentsClientWorkspace(thirdWebContents, 'workspace-2')

    emitLegacyRpcEvent(RPC_CHANNELS.settings.onChange, { to: 'workspace', workspaceId: 'workspace-1' }, settings)

    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(thirdWebContents.send).not.toHaveBeenCalled()
  })

  it('honors workspace RPC event exclusions', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { emitLegacyRpcEvent } = await import('@main/bootstrap/legacy-rpc-event-bridge')
    const { bindLegacyWebContentsClientWorkspace } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const firstWebContents = { id: 301, send: vi.fn() }
    const secondWebContents = { id: 302, send: vi.fn() }
    const settings = createDefaultAppSettings()

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])
    bindLegacyWebContentsClientWorkspace(firstWebContents, 'workspace-1')
    bindLegacyWebContentsClientWorkspace(secondWebContents, 'workspace-1')

    emitLegacyRpcEvent(
      RPC_CHANNELS.settings.onChange,
      { to: 'workspace', workspaceId: 'workspace-1', exclude: '302' },
      settings
    )

    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).not.toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
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

  it('maps RPC event envelopes to legacy IPC events without changing payloads', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { emitLegacyRpcEventEnvelope } = await import('@main/bootstrap/legacy-rpc-event-bridge')
    const firstWebContents = { id: 401, send: vi.fn() }
    const secondWebContents = { id: 402, send: vi.fn() }
    const selectedSender = { send: vi.fn() }
    const settings = createDefaultAppSettings()
    const projectEvent = { projects: [], activeProject: null }
    const windowState = { isMaximized: true }
    const sessionEvent = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    emitLegacyRpcEventEnvelope(
      { to: 'all' },
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.settings.onChange,
        args: [settings]
      }
    )
    emitLegacyRpcEventEnvelope(
      { to: 'all' },
      {
        id: 'event-2',
        type: 'event',
        channel: RPC_CHANNELS.projects.onChange,
        args: [projectEvent]
      }
    )
    emitLegacyRpcEventEnvelope(
      { to: 'webContents', sender: selectedSender },
      {
        id: 'event-3',
        type: 'event',
        channel: RPC_CHANNELS.window.onStateChange,
        args: [windowState]
      }
    )
    emitLegacyRpcEventEnvelope(
      { to: 'webContents', sender: selectedSender },
      {
        id: 'event-4',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [sessionEvent]
      }
    )

    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.projects.onChange, projectEvent)
    expect(secondWebContents.send).toHaveBeenCalledWith(
      ipcChannels.projects.onChange,
      projectEvent
    )
    expect(selectedSender.send).toHaveBeenCalledWith(ipcChannels.window.onStateChange, windowState)
    expect(selectedSender.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, sessionEvent)
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

  it('throws a clear error for unsupported RPC event envelopes', async () => {
    const { emitLegacyRpcEventEnvelope } = await import('@main/bootstrap/legacy-rpc-event-bridge')

    expect(() =>
      emitLegacyRpcEventEnvelope(
        { to: 'all' },
        {
          id: 'response-1',
          type: 'response',
          channel: 'session:event'
        }
      )
    ).toThrow('Unsupported legacy RPC event envelope type: response')
    expect(() =>
      emitLegacyRpcEventEnvelope(
        { to: 'all' },
        {
          id: 'event-1',
          type: 'event'
        }
      )
    ).toThrow('Missing legacy RPC event envelope channel')
  })
})
