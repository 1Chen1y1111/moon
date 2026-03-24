// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeHandlerMock = vi.fn()
const handleMock = vi.fn()
const fromWebContentsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: fromWebContentsMock
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock
  }
}))

describe('registerIpcHandlers', () => {
  const settingsService = {
    getSettings: vi.fn(),
    saveProvider: vi.fn()
  }
  const openSettingsWindow = vi.fn()

  beforeEach(() => {
    removeHandlerMock.mockReset()
    handleMock.mockReset()
    fromWebContentsMock.mockReset()
    settingsService.getSettings.mockReset()
    settingsService.saveProvider.mockReset()
    openSettingsWindow.mockReset()
  })

  it('registers window control handlers that operate on the sender window', async () => {
    const browserWindow = {
      close: vi.fn(),
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn()
    }

    fromWebContentsMock.mockReturnValue(browserWindow)

    const { registerIpcHandlers } = await import('./register-ipc')
    const { ipcChannels } = await import('../ipc/channels')

    registerIpcHandlers({
      openSettingsWindow,
      settingsService: settingsService as never
    })

    const closeHandler = handleMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.window.close
    )?.[1]
    const minimizeHandler = handleMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.window.minimize
    )?.[1]
    const toggleMaximizeHandler = handleMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.window.toggleMaximize
    )?.[1]

    expect(closeHandler).toBeTypeOf('function')
    expect(minimizeHandler).toBeTypeOf('function')
    expect(toggleMaximizeHandler).toBeTypeOf('function')

    const event = { sender: {} }

    await closeHandler?.(event)
    await minimizeHandler?.(event)
    await toggleMaximizeHandler?.(event)

    expect(fromWebContentsMock).toHaveBeenCalledTimes(3)
    expect(browserWindow.close).toHaveBeenCalledTimes(1)
    expect(browserWindow.minimize).toHaveBeenCalledTimes(1)
    expect(browserWindow.maximize).toHaveBeenCalledTimes(1)
    expect(browserWindow.unmaximize).not.toHaveBeenCalled()
  })

  it('registers a handler that opens the dedicated settings window', async () => {
    const { registerIpcHandlers } = await import('./register-ipc')
    const { ipcChannels } = await import('../ipc/channels')

    registerIpcHandlers({
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const openSettingsHandler = handleMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.window.openSettings
    )?.[1]

    expect(openSettingsHandler).toBeTypeOf('function')

    await openSettingsHandler?.()

    expect(openSettingsWindow).toHaveBeenCalledTimes(1)
  })
})
