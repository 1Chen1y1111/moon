// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserWindowMock = vi.fn()
const shellOpenExternalMock = vi.fn()
let browserWindowInstances: ReturnType<typeof createBrowserWindowInstance>[]
const isMock = { dev: false }

class BrowserWindowMock {
  constructor(options: unknown) {
    browserWindowMock(options)
    return browserWindowInstances.shift() as ReturnType<typeof createBrowserWindowInstance>
  }
}

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  shell: {
    openExternal: shellOpenExternalMock
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: isMock
}))

vi.mock('../../../resources/icon.png?asset', () => ({
  default: 'icon.png'
}))

function createBrowserWindowInstance(): {
  on: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  isMinimized: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  setWindowButtonVisibility: ReturnType<typeof vi.fn>
  webContents: {
    openDevTools: ReturnType<typeof vi.fn>
    setWindowOpenHandler: ReturnType<typeof vi.fn>
  }
} {
  return {
    on: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    setWindowButtonVisibility: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn()
    }
  }
}

describe('openSettingsWindow', () => {
  const env = process.env as Record<string, string | undefined>

  beforeEach(() => {
    vi.resetModules()
    browserWindowMock.mockReset()
    shellOpenExternalMock.mockReset()
    isMock.dev = false
    delete env['ELECTRON_RENDERER_URL']
    browserWindowInstances = [createBrowserWindowInstance(), createBrowserWindowInstance()]
  })

  it('reuses the existing settings window by focusing it', async () => {
    const { openSettingsWindow } = await import('./create-settings-window')

    const firstWindow = openSettingsWindow()
    const secondWindow = openSettingsWindow()

    expect(browserWindowMock).toHaveBeenCalledTimes(1)
    expect(firstWindow).toBe(secondWindow)
    expect(firstWindow.focus).toHaveBeenCalledTimes(1)
  })

  it('loads the settings route when running against the renderer dev server', async () => {
    isMock.dev = true
    env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5173'
    const firstWindow = browserWindowInstances[0]

    const { openSettingsWindow } = await import('./create-settings-window')

    openSettingsWindow()

    expect(firstWindow?.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173#/settings')
  })

  it('loads the settings route when using the packaged renderer file', async () => {
    const firstWindow = browserWindowInstances[0]
    const { openSettingsWindow } = await import('./create-settings-window')

    openSettingsWindow()

    expect(firstWindow?.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/renderer[\\/]+index\.html$/),
      { hash: '/settings' }
    )
  })
})
