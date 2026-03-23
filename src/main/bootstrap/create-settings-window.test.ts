// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserWindowMock = vi.fn()
const shellOpenExternalMock = vi.fn()
let browserWindowInstances: ReturnType<typeof createBrowserWindowInstance>[]
const isMock = { dev: false }

class BrowserWindowMock {
  constructor(options: unknown) {
    browserWindowMock(options)
    return browserWindowInstances.shift()
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

function createBrowserWindowInstance() {
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
})
