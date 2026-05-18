// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dockSetIconMock = vi.fn()

vi.mock('electron', () => ({
  default: {
    app: {
      dock: {
        setIcon: dockSetIconMock
      }
    }
  },
  app: {
    dock: {
      setIcon: dockSetIconMock
    }
  }
}))

vi.mock('/apps/desktop/resources/icon.png?asset', () => ({
  default: 'icon.png'
}))

describe('setApplicationIcon', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.resetModules()
    dockSetIconMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    })
  })

  it('sets the Dock icon on macOS', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin'
    })

    const { setApplicationIcon } = await import('@main/bootstrap/app-icon')

    setApplicationIcon()

    expect(dockSetIconMock).toHaveBeenCalledWith('icon.png')
  })

  it('does not touch the Dock icon on other platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32'
    })

    const { setApplicationIcon } = await import('@main/bootstrap/app-icon')

    setApplicationIcon()

    expect(dockSetIconMock).not.toHaveBeenCalled()
  })
})
