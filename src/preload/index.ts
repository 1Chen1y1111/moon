import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { ipcChannels } from '../main/ipc/channels'
import type { AppIpcContractMap, MoonApi } from '../main/ipc/contracts'

function invokeIpcChannel<TChannel extends keyof AppIpcContractMap>(
  channel: TChannel,
  request?: AppIpcContractMap[TChannel]['request']
): Promise<AppIpcContractMap[TChannel]['response']> {
  if (request === undefined) {
    return ipcRenderer.invoke(channel) as Promise<AppIpcContractMap[TChannel]['response']>
  }

  return ipcRenderer.invoke(channel, request) as Promise<AppIpcContractMap[TChannel]['response']>
}

const api: MoonApi = {
  settings: {
    get: () => invokeIpcChannel(ipcChannels.settings.get),
    saveProvider: (input) => invokeIpcChannel(ipcChannels.settings.saveProvider, input)
  },
  windowControls: {
    close: () => invokeIpcChannel(ipcChannels.window.close),
    minimize: () => invokeIpcChannel(ipcChannels.window.minimize),
    toggleMaximize: () => invokeIpcChannel(ipcChannels.window.toggleMaximize),
    openSettings: () => invokeIpcChannel(ipcChannels.window.openSettings),
    getState: () => invokeIpcChannel(ipcChannels.window.getState),
    onStateChange: (listener) => {
      const channel = ipcChannels.window.onStateChange
      const handler = (_event: unknown, payload: { isMaximized: boolean }): void =>
        listener(payload)

      ipcRenderer.on(channel, handler)

      return () => {
        ipcRenderer.off(channel, handler)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  const windowWithBridge = window as unknown as Window & {
    electron: typeof electronAPI
    api: MoonApi
  }

  windowWithBridge.electron = electronAPI
  windowWithBridge.api = api
}
