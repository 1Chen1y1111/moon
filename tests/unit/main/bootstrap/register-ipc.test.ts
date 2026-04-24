// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeHandlerMock = vi.fn()
const handleMock = vi.fn()
const fromWebContentsMock = vi.fn()
const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
    getAllWindows: getAllWindowsMock
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock
  }
}))

function getRegisteredHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  return handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
}

describe('registerIpcHandlers', () => {
  const settingsService = {
    getSettings: vi.fn(),
    saveAppearance: vi.fn(),
    saveProvider: vi.fn()
  }
  const openSettingsWindow = vi.fn()

  beforeEach(() => {
    removeHandlerMock.mockReset()
    handleMock.mockReset()
    fromWebContentsMock.mockReset()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([])
    settingsService.getSettings.mockReset()
    settingsService.saveAppearance.mockReset()
    settingsService.saveProvider.mockReset()
    openSettingsWindow.mockReset()
  })

  it('registers settings handlers that delegate through the settings service', async () => {
    const { createDefaultAppSettings } = await import('@shared/domain/settings')
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const settings = createDefaultAppSettings()
    const input = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    }

    settingsService.getSettings.mockResolvedValue(settings)
    settingsService.saveAppearance.mockResolvedValue(settings)
    settingsService.saveProvider.mockResolvedValue(settings)

    registerIpcHandlers({
      openSettingsWindow,
      settingsService: settingsService as never
    })

    const getSettingsHandler = getRegisteredHandler(ipcChannels.settings.get)
    const saveAppearanceHandler = getRegisteredHandler(ipcChannels.settings.saveAppearance)
    const saveProviderHandler = getRegisteredHandler(ipcChannels.settings.saveProvider)

    expect(getSettingsHandler).toBeTypeOf('function')
    expect(saveAppearanceHandler).toBeTypeOf('function')
    expect(saveProviderHandler).toBeTypeOf('function')
    expect(await getSettingsHandler?.({ sender: {} })).toBe(settings)
    expect(await saveAppearanceHandler?.({ sender: {} }, { theme: 'dark' })).toBe(settings)
    expect(await saveProviderHandler?.({ sender: {} }, input)).toBe(settings)
    expect(settingsService.saveAppearance).toHaveBeenCalledWith({ theme: 'dark' })
    expect(settingsService.saveProvider).toHaveBeenCalledWith(input)
  })

  it('broadcasts saved settings to open renderer windows', async () => {
    const { createDefaultAppSettings } = await import('@shared/domain/settings')
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const settings = createDefaultAppSettings()
    const firstWebContents = { send: vi.fn() }
    const secondWebContents = { send: vi.fn() }

    settingsService.saveAppearance.mockResolvedValue(settings)
    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    registerIpcHandlers({
      openSettingsWindow,
      settingsService: settingsService as never
    })

    const saveAppearanceHandler = getRegisteredHandler(ipcChannels.settings.saveAppearance)

    expect(await saveAppearanceHandler?.({ sender: {} }, { theme: 'dark' })).toBe(settings)
    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
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

    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      openSettingsWindow,
      settingsService: settingsService as never
    })

    const closeHandler = getRegisteredHandler(ipcChannels.window.close)
    const minimizeHandler = getRegisteredHandler(ipcChannels.window.minimize)
    const toggleMaximizeHandler = getRegisteredHandler(ipcChannels.window.toggleMaximize)

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
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const openSettingsHandler = getRegisteredHandler(ipcChannels.window.openSettings)

    expect(openSettingsHandler).toBeTypeOf('function')

    await openSettingsHandler?.()
    await openSettingsHandler?.({ sender: {} }, { section: 'providers' })

    expect(openSettingsWindow).toHaveBeenCalledTimes(2)
    expect(openSettingsWindow).toHaveBeenCalledWith(undefined)
    expect(openSettingsWindow).toHaveBeenCalledWith({ section: 'providers' })
  })

  it('rejects unsupported settings-window sections before opening a window', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const openSettingsHandler = getRegisteredHandler(ipcChannels.window.openSettings)

    expect(() => openSettingsHandler?.({ sender: {} }, { section: 'general' })).toThrow()
    expect(openSettingsWindow).not.toHaveBeenCalled()
  })

  it('registers a handler that reads the sender window state', async () => {
    const browserWindow = {
      isMaximized: vi.fn(() => true)
    }

    fromWebContentsMock.mockReturnValue(browserWindow)

    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const getStateHandler = getRegisteredHandler(ipcChannels.window.getState)

    expect(getStateHandler).toBeTypeOf('function')
    expect(getStateHandler?.({ sender: {} })).toEqual({ isMaximized: true })
  })
})
