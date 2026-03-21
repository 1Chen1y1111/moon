// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserWindowMock = vi.fn()
const shellOpenExternalMock = vi.fn()
let browserWindowInstance: ReturnType<typeof createBrowserWindowInstance>

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
  is: {
    dev: false
  }
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
      setWindowOpenHandler: vi.fn()
    }
  }
}

describe('createWindow', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    browserWindowMock.mockReset()
    shellOpenExternalMock.mockReset()
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
})
