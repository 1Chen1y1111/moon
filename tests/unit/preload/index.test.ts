// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import type { MoonApi } from '@ipc/contracts'

const exposeInMainWorldMock = vi.fn()
const ipcInvokeMock = vi.fn()
const ipcOnMock = vi.fn()
const ipcOffMock = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock
  },
  ipcRenderer: {
    invoke: ipcInvokeMock,
    on: ipcOnMock,
    off: ipcOffMock
  }
}))

function getExposedApi(): MoonApi {
  return exposeInMainWorldMock.mock.calls.find(([key]) => key === 'api')?.[1] as MoonApi
}

describe('preload api', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorldMock.mockReset()
    ipcInvokeMock.mockReset()
    ipcOnMock.mockReset()
    ipcOffMock.mockReset()
    Object.defineProperty(process, 'contextIsolated', {
      configurable: true,
      value: true
    })
  })

  it('exposes an openSettings window control bridge', async () => {
    await import('@preload/index')

    const apiCall = getExposedApi()

    expect(apiCall.windowControls.openSettings).toBeTypeOf('function')
    expect(exposeInMainWorldMock.mock.calls.some(([key]) => key === 'electron')).toBe(false)
  })

  it('routes public api calls through the typed IPC channels', async () => {
    const input = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    } as const

    await import('@preload/index')

    const api = getExposedApi()

    await api.settings.get()
    await api.settings.saveAppearance({ theme: 'dark' })
    await api.settings.saveProvider(input)
    await api.windowControls.openSettings({ section: 'providers' })

    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.settings.get)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.settings.saveAppearance, {
      theme: 'dark'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.settings.saveProvider, input)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.window.openSettings, {
      section: 'providers'
    })
  })

  it('cleans up the window state event subscription', async () => {
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()

    const unsubscribe = api.windowControls.onStateChange(listener)
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.window.onStateChange
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, { isMaximized: true })
    unsubscribe()

    expect(listener).toHaveBeenCalledWith({ isMaximized: true })
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.window.onStateChange, handler)
  })

  it('cleans up the settings change event subscription', async () => {
    const { createDefaultAppSettings } = await import('@shared/domain/settings')
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()
    const settings = createDefaultAppSettings()

    const unsubscribe = api.settings.onChange(listener)
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.settings.onChange
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, settings)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(settings)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.settings.onChange, handler)
  })
})
