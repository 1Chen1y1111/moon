// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  registerWindowStateEvents,
  setWindowStateEventSink
} from '@main/bootstrap/window-state-events'
import { RPC_CHANNELS } from '@moon/shared/protocol'

type WindowEventName = 'maximize' | 'unmaximize' | 'restore'

describe('registerWindowStateEvents', () => {
  afterEach(() => {
    setWindowStateEventSink(null)
  })

  it('publishes the maximized state when the native window state changes', () => {
    const listeners = new Map<WindowEventName, () => void>()
    const push = vi.fn()
    const browserWindow = {
      isMaximized: vi.fn(() => true),
      on: vi.fn((event: WindowEventName, listener: () => void) => {
        listeners.set(event, listener)
      }),
      webContents: {
        id: 88
      }
    }

    setWindowStateEventSink({
      findClientByWebContentsId: vi.fn(() => 'client-88'),
      push
    })
    registerWindowStateEvents(browserWindow as never)

    expect(browserWindow.on).toHaveBeenCalledWith('maximize', expect.any(Function))
    expect(browserWindow.on).toHaveBeenCalledWith('unmaximize', expect.any(Function))
    expect(browserWindow.on).toHaveBeenCalledWith('restore', expect.any(Function))

    listeners.get('maximize')?.()

    expect(push).toHaveBeenCalledWith(
      RPC_CHANNELS.window.onStateChange,
      { to: 'client', clientId: 'client-88' },
      { isMaximized: true }
    )
  })
})
