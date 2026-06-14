// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: unknown[]) => void

const appEventHandlers = new Map<string, Handler[]>()
const appOnMock = vi.fn((event: string, handler: Handler) => {
  const handlers = appEventHandlers.get(event) ?? []

  handlers.push(handler)
  appEventHandlers.set(event, handlers)
})
const appQuitMock = vi.fn()
const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  app: {
    on: appOnMock,
    quit: appQuitMock
  },
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  }
}))

function emitAppEvent(event: string, ...args: unknown[]): void {
  appEventHandlers.get(event)?.forEach((handler) => {
    handler(...args)
  })
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('registerAppLifecycle', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.resetModules()
    appEventHandlers.clear()
    appOnMock.mockClear()
    appQuitMock.mockClear()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([])
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    })
  })

  it('prevents the first quit, destroys windows, closes resources, and quits again', async () => {
    const closeApplicationResources = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const createMainWindow = vi.fn()
    const openWindow = {
      destroy: vi.fn(),
      isDestroyed: vi.fn(() => false)
    }
    const destroyedWindow = {
      destroy: vi.fn(),
      isDestroyed: vi.fn(() => true)
    }

    getAllWindowsMock.mockReturnValue([openWindow, destroyedWindow])

    const { registerAppLifecycle } = await import('@main/bootstrap/app-lifecycle')

    registerAppLifecycle({
      createMainWindow: createMainWindow as never,
      closeApplicationResources
    })

    const event = { preventDefault: vi.fn() }

    emitAppEvent('before-quit', event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(openWindow.destroy).toHaveBeenCalledTimes(1)
    expect(destroyedWindow.destroy).not.toHaveBeenCalled()
    expect(closeApplicationResources).toHaveBeenCalledTimes(1)

    await flushPromises()

    expect(appQuitMock).toHaveBeenCalledTimes(1)

    const secondEvent = { preventDefault: vi.fn() }

    emitAppEvent('before-quit', secondEvent)

    expect(secondEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('does not close resources twice while quit cleanup is still running', async () => {
    let resolveCloseResources: () => void = () => undefined
    const closeApplicationResources = vi.fn<() => Promise<void>>(
      () =>
        new Promise((resolve) => {
          resolveCloseResources = resolve
        })
    )

    const { registerAppLifecycle } = await import('@main/bootstrap/app-lifecycle')

    registerAppLifecycle({
      createMainWindow: vi.fn() as never,
      closeApplicationResources
    })

    const firstEvent = { preventDefault: vi.fn() }
    const secondEvent = { preventDefault: vi.fn() }

    emitAppEvent('before-quit', firstEvent)
    emitAppEvent('before-quit', secondEvent)

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(closeApplicationResources).toHaveBeenCalledTimes(1)
    expect(appQuitMock).not.toHaveBeenCalled()

    resolveCloseResources()
    await flushPromises()

    expect(appQuitMock).toHaveBeenCalledTimes(1)
  })

  it('does not create a new window on activate while quitting', async () => {
    let resolveCloseResources: () => void = () => undefined
    const closeApplicationResources = vi.fn<() => Promise<void>>(
      () =>
        new Promise((resolve) => {
          resolveCloseResources = resolve
        })
    )
    const createMainWindow = vi.fn()

    const { registerAppLifecycle } = await import('@main/bootstrap/app-lifecycle')

    registerAppLifecycle({
      createMainWindow: createMainWindow as never,
      closeApplicationResources
    })

    emitAppEvent('before-quit', { preventDefault: vi.fn() })
    emitAppEvent('activate')

    expect(createMainWindow).not.toHaveBeenCalled()

    resolveCloseResources()
    await flushPromises()
  })

  it('quits when all windows close on non-macOS platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux'
    })

    const { registerAppLifecycle } = await import('@main/bootstrap/app-lifecycle')

    registerAppLifecycle({
      createMainWindow: vi.fn() as never,
      closeApplicationResources: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    })

    emitAppEvent('window-all-closed')

    expect(appQuitMock).toHaveBeenCalledTimes(1)
  })
})
