import { contextBridge, ipcRenderer } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type { AppIpcContractMap, MoonApi } from '@ipc/contracts'

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
  chat: {
    listSessions: () => invokeIpcChannel(ipcChannels.chat.listSessions),
    getMessages: (input) => invokeIpcChannel(ipcChannels.chat.getMessages, input),
    listTopics: (input) => invokeIpcChannel(ipcChannels.chat.listTopics, input),
    listThreads: (input) => invokeIpcChannel(ipcChannels.chat.listThreads, input),
    createSession: () => invokeIpcChannel(ipcChannels.chat.createSession),
    importAttachment: (input) => invokeIpcChannel(ipcChannels.chat.importAttachment, input),
    sendMessage: (input) => invokeIpcChannel(ipcChannels.chat.sendMessage, input),
    cancelOperation: (input) => invokeIpcChannel(ipcChannels.chat.cancelOperation, input),
    approveToolCall: (input) => invokeIpcChannel(ipcChannels.chat.approveToolCall, input),
    rejectToolCall: (input) => invokeIpcChannel(ipcChannels.chat.rejectToolCall, input),
    onSendMessageEvent: (listener) => {
      const channel = ipcChannels.chat.sendMessageEvent
      const handler = (_event: unknown, payload: Parameters<typeof listener>[0]): void =>
        listener(payload)

      ipcRenderer.on(channel, handler)

      return () => {
        ipcRenderer.off(channel, handler)
      }
    }
  },
  settings: {
    get: () => invokeIpcChannel(ipcChannels.settings.get),
    createCustomProvider: (input) =>
      invokeIpcChannel(ipcChannels.settings.createCustomProvider, input),
    createCustomAcpProvider: (input) =>
      invokeIpcChannel(ipcChannels.settings.createCustomAcpProvider, input),
    saveProvider: (input) => invokeIpcChannel(ipcChannels.settings.saveProvider, input),
    deleteProvider: (input) => invokeIpcChannel(ipcChannels.settings.deleteProvider, input),
    fetchProviderModels: (input) =>
      invokeIpcChannel(ipcChannels.settings.fetchProviderModels, input),
    testProvider: (input) => invokeIpcChannel(ipcChannels.settings.testProvider, input),
    saveAppearance: (input) => invokeIpcChannel(ipcChannels.settings.saveAppearance, input),
    onChange: (listener) => {
      const channel = ipcChannels.settings.onChange
      const handler = (_event: unknown, payload: Parameters<typeof listener>[0]): void =>
        listener(payload)

      ipcRenderer.on(channel, handler)

      return () => {
        ipcRenderer.off(channel, handler)
      }
    }
  },
  windowControls: {
    close: () => invokeIpcChannel(ipcChannels.window.close),
    minimize: () => invokeIpcChannel(ipcChannels.window.minimize),
    toggleMaximize: () => invokeIpcChannel(ipcChannels.window.toggleMaximize),
    openSettings: (input) => invokeIpcChannel(ipcChannels.window.openSettings, input),
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
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  const windowWithBridge = window as unknown as Window & {
    api: MoonApi
  }

  windowWithBridge.api = api
}
