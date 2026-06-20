// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import { registerWindowStateEvents } from '@main/bootstrap/window-state-events'
import { RPC_CHANNELS } from '@moon/shared/protocol'

type WindowEventName = 'maximize' | 'unmaximize' | 'restore'

describe('registerWindowStateEvents', () => {
  it('publishes the maximized state when the native window state changes', () => {
    const listeners = new Map<WindowEventName, () => void>()
    const send = vi.fn()
    const browserWindow = {
      isMaximized: vi.fn(() => true),
      on: vi.fn((event: WindowEventName, listener: () => void) => {
        listeners.set(event, listener)
      }),
      webContents: {
        send
      }
    }

    registerWindowStateEvents(browserWindow as never)

    expect(browserWindow.on).toHaveBeenCalledWith('maximize', expect.any(Function))
    expect(browserWindow.on).toHaveBeenCalledWith('unmaximize', expect.any(Function))
    expect(browserWindow.on).toHaveBeenCalledWith('restore', expect.any(Function))

    listeners.get('maximize')?.()

    expect(send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.window.onStateChange,
        args: [{ isMaximized: true }]
      })
    )
  })
})
