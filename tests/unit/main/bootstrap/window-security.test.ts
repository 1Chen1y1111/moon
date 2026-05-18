// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const shellOpenExternalMock = vi.fn()
const isMock = { dev: false }

type WindowOpenHandler = (details: { url: string }) => { action: 'deny' }

vi.mock('electron', () => ({
  default: {
    shell: {
      openExternal: shellOpenExternalMock
    }
  },
  shell: {
    openExternal: shellOpenExternalMock
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: isMock
}))

describe('window-security', () => {
  const env = process.env as Record<string, string | undefined>

  beforeEach(() => {
    shellOpenExternalMock.mockReset()
    isMock.dev = false
    delete env['ELECTRON_RENDERER_URL']
  })

  it('allows https external URLs and rejects unsafe protocols', async () => {
    const { isAllowedExternalUrl } = await import('@main/bootstrap/window-security')

    expect(isAllowedExternalUrl('https://example.com/docs')).toBe(true)
    expect(isAllowedExternalUrl('http://example.com/docs')).toBe(false)
    expect(isAllowedExternalUrl('file:///tmp/example.html')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
  })

  it('allows http external URLs only for loopback hosts in development', async () => {
    isMock.dev = true
    const { isAllowedExternalUrl } = await import('@main/bootstrap/window-security')

    expect(isAllowedExternalUrl('http://localhost:5173/docs')).toBe(true)
    expect(isAllowedExternalUrl('http://127.0.0.1:5173/docs')).toBe(true)
    expect(isAllowedExternalUrl('http://[::1]:5173/docs')).toBe(true)
    expect(isAllowedExternalUrl('http://example.com/docs')).toBe(false)
  })

  it('limits renderer navigation to the configured app origin in development', async () => {
    isMock.dev = true
    env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5173'
    const { isAllowedAppNavigation } = await import('@main/bootstrap/window-security')

    expect(isAllowedAppNavigation('http://127.0.0.1:5173#/settings')).toBe(true)
    expect(isAllowedAppNavigation('http://127.0.0.1:5173/settings')).toBe(true)
    expect(isAllowedAppNavigation('https://example.com')).toBe(false)
  })

  it('denies window creation and opens only allowed URLs externally', async () => {
    const { registerWindowSecurity } = await import('@main/bootstrap/window-security')
    const setWindowOpenHandler = vi.fn()
    const on = vi.fn()

    registerWindowSecurity({
      webContents: {
        setWindowOpenHandler,
        on
      }
    } as Parameters<typeof registerWindowSecurity>[0])

    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as WindowOpenHandler

    expect(handler({ url: 'file:///tmp/example.html' })).toEqual({ action: 'deny' })
    expect(shellOpenExternalMock).not.toHaveBeenCalled()

    expect(handler({ url: 'https://example.com/docs' })).toEqual({ action: 'deny' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(shellOpenExternalMock).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('prevents renderer top-level navigation away from the app', async () => {
    const { registerWindowSecurity } = await import('@main/bootstrap/window-security')
    const setWindowOpenHandler = vi.fn()
    const on = vi.fn()

    registerWindowSecurity({
      webContents: {
        setWindowOpenHandler,
        on
      }
    } as Parameters<typeof registerWindowSecurity>[0])

    const navigateHandler = on.mock.calls.find(([event]) => event === 'will-navigate')?.[1] as (
      event: { preventDefault: () => void },
      url: string
    ) => void
    const event = {
      preventDefault: vi.fn()
    }

    navigateHandler(event, 'https://example.com')

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})
