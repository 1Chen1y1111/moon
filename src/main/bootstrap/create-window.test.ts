// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserWindowMock = vi.fn()
const shellOpenExternalMock = vi.fn()
let browserWindowInstance: ReturnType<typeof createBrowserWindowInstance>
const isMock = { dev: false }

class BrowserWindowMock {
  constructor(options: unknown) {
    browserWindowMock(options)
    return browserWindowInstance
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
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    setWindowButtonVisibility: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn()
    }
  }
}

describe('createWindow', () => {
  const originalPlatform = process.platform
  const env = process.env as Record<string, string | undefined>

  beforeEach(() => {
    vi.resetModules()
    browserWindowMock.mockReset()
    shellOpenExternalMock.mockReset()
    isMock.dev = false
    delete env['ELECTRON_RENDERER_URL']
    browserWindowInstance = createBrowserWindowInstance()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    })
  })

  it('hides the native macOS title bar and traffic lights when using the custom sidebar chrome', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin'
    })

    const { createWindow } = await import('./create-window')

    createWindow()

    expect(browserWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        titleBarStyle: 'hidden'
      })
    )
    expect(browserWindowInstance.setWindowButtonVisibility).toHaveBeenCalledWith(false)
  })

  it('opens DevTools automatically when running against the renderer dev server', async () => {
    isMock.dev = true
    env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5173'

    const { createWindow } = await import('./create-window')

    createWindow()

    expect(browserWindowInstance.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173')
    expect(browserWindowInstance.webContents.openDevTools).toHaveBeenCalledWith({
      mode: 'detach'
    })
  })
})
