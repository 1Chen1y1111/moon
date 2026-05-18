import { ipcChannels } from '@moon/ipc/channels'

type WindowWithStateEvents = {
  isMaximized: () => boolean
  on(eventName: 'maximize' | 'unmaximize' | 'restore', listener: () => void): unknown
  webContents: {
    send: (channel: string, payload: { isMaximized: boolean }) => void
  }
}

export function registerWindowStateEvents(window: WindowWithStateEvents): void {
  const publishWindowState = (): void => {
    window.webContents.send(ipcChannels.window.onStateChange, {
      isMaximized: window.isMaximized()
    })
  }

  window.on('maximize', publishWindowState)
  window.on('unmaximize', publishWindowState)
  window.on('restore', publishWindowState)
}
