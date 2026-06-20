// @vitest-environment node

/**
 * 负责验证 preload IPC RPC client 的 channel 映射。
 * 测试只覆盖 preload transport adapter，不触发真实 Electron 或 renderer。
 */

import { describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import { createIpcRpcClient } from '@preload/ipc-rpc-client'

function createIpcRendererFixture(): {
  ipcRenderer: Parameters<typeof createIpcRpcClient>[0]
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
} {
  const invoke = vi.fn()
  const on = vi.fn()
  const off = vi.fn()

  return {
    ipcRenderer: {
      invoke,
      on,
      off
    } as unknown as Parameters<typeof createIpcRpcClient>[0],
    invoke,
    on,
    off
  }
}

describe('createIpcRpcClient', () => {
  it('does not pass undefined for app-shell invokes without args', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createIpcRpcClient(ipcRenderer)

    invoke.mockResolvedValue({ theme: 'system' })

    await expect(client.invoke(RPC_CHANNELS.settings.get)).resolves.toEqual({ theme: 'system' })
    expect(invoke).toHaveBeenCalledWith(ipcChannels.settings.get)
    expect(invoke).not.toHaveBeenCalledWith(ipcChannels.settings.get, undefined)
  })

  it('maps app-shell protocol channels to legacy IPC channels', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createIpcRpcClient(ipcRenderer)
    const settingsInput = { providerId: 'provider-1' }
    const projectInput = { projectId: 'project-1' }

    invoke.mockResolvedValue(undefined)

    await client.invoke(RPC_CHANNELS.settings.deleteProvider, settingsInput)
    await client.invoke(RPC_CHANNELS.projects.setActive, projectInput)
    await client.invoke(RPC_CHANNELS.window.openSettings, { section: 'providers' })

    expect(invoke).toHaveBeenCalledWith(ipcChannels.settings.deleteProvider, settingsInput)
    expect(invoke).toHaveBeenCalledWith(ipcChannels.projects.setActive, projectInput)
    expect(invoke).toHaveBeenCalledWith(ipcChannels.window.openSettings, { section: 'providers' })
  })

  it('passes unknown channels through unchanged', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createIpcRpcClient(ipcRenderer)

    invoke.mockResolvedValue('ok')

    await expect(client.invoke('custom:echo', { ok: true })).resolves.toBe('ok')
    expect(invoke).toHaveBeenCalledWith('custom:echo', { ok: true })
  })

  it('maps app-shell event subscriptions to legacy IPC event channels', () => {
    const { ipcRenderer, on, off } = createIpcRendererFixture()
    const client = createIpcRpcClient(ipcRenderer)
    const listener = vi.fn()
    const event = { activeProject: null, projects: [] }

    const unsubscribe = client.on(RPC_CHANNELS.projects.onChange, listener)
    const handler = on.mock.calls.find(
      ([channel]) => channel === ipcChannels.projects.onChange
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, event)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(off).toHaveBeenCalledWith(ipcChannels.projects.onChange, handler)
  })
})
