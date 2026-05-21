import { BrowserWindow, ipcMain } from 'electron'

import { ipcChannels } from '@ipc/channels'
import { openSettingsInputSchema } from '@ipc/window-contracts'
import type { AppSettings } from '../../shared/domain/settings'
import type { ChatService } from '../services/chat-service'
import type { SettingsService } from '../services/settings-service'

type RegisterIpcDependencies = {
  chatService: ChatService
  settingsService: SettingsService
  openSettingsWindow: (input?: { section?: 'providers' }) => BrowserWindow
}

function broadcastSettingsChange(settings: AppSettings): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(ipcChannels.settings.onChange, settings)
  })
}

export function registerIpcHandlers({
  chatService,
  openSettingsWindow,
  settingsService
}: RegisterIpcDependencies): void {
  ipcMain.removeHandler(ipcChannels.chat.listSessions)
  ipcMain.removeHandler(ipcChannels.chat.getMessages)
  ipcMain.removeHandler(ipcChannels.chat.listTopics)
  ipcMain.removeHandler(ipcChannels.chat.listThreads)
  ipcMain.removeHandler(ipcChannels.chat.createSession)
  ipcMain.removeHandler(ipcChannels.chat.deleteSession)
  ipcMain.removeHandler(ipcChannels.chat.importAttachment)
  ipcMain.removeHandler(ipcChannels.chat.createMessageTurn)
  ipcMain.removeHandler(ipcChannels.chat.runOperation)
  ipcMain.removeHandler(ipcChannels.chat.sendMessage)
  ipcMain.removeHandler(ipcChannels.chat.cancelOperation)
  ipcMain.removeHandler(ipcChannels.chat.approveToolCall)
  ipcMain.removeHandler(ipcChannels.chat.rejectToolCall)
  ipcMain.removeHandler(ipcChannels.settings.get)
  ipcMain.removeHandler(ipcChannels.settings.createCustomProvider)
  ipcMain.removeHandler(ipcChannels.settings.createCustomAcpProvider)
  ipcMain.removeHandler(ipcChannels.settings.saveProvider)
  ipcMain.removeHandler(ipcChannels.settings.deleteProvider)
  ipcMain.removeHandler(ipcChannels.settings.fetchProviderModels)
  ipcMain.removeHandler(ipcChannels.settings.testProvider)
  ipcMain.removeHandler(ipcChannels.settings.saveAppearance)
  ipcMain.removeHandler(ipcChannels.window.close)
  ipcMain.removeHandler(ipcChannels.window.minimize)
  ipcMain.removeHandler(ipcChannels.window.toggleMaximize)
  ipcMain.removeHandler(ipcChannels.window.openSettings)
  ipcMain.removeHandler(ipcChannels.window.getState)

  ipcMain.handle(ipcChannels.chat.listSessions, () => chatService.listSessions())
  ipcMain.handle(ipcChannels.chat.getMessages, (_event, input) => chatService.getMessages(input))
  ipcMain.handle(ipcChannels.chat.listTopics, (_event, input) => chatService.listTopics(input))
  ipcMain.handle(ipcChannels.chat.listThreads, (_event, input) => chatService.listThreads(input))
  ipcMain.handle(ipcChannels.chat.createSession, () => chatService.createSession())
  ipcMain.handle(ipcChannels.chat.deleteSession, (_event, input) =>
    chatService.deleteSession(input)
  )
  ipcMain.handle(ipcChannels.chat.importAttachment, (_event, input) =>
    chatService.importAttachment(input)
  )
  ipcMain.handle(ipcChannels.chat.createMessageTurn, (_event, input) =>
    chatService.createMessageTurn(input)
  )
  ipcMain.handle(ipcChannels.chat.runOperation, (event, input) =>
    chatService.runOperation(input, (operationEvent) => {
      event.sender.send(ipcChannels.chat.operationEvent, operationEvent)
    })
  )
  ipcMain.handle(ipcChannels.chat.sendMessage, (event, input) =>
    chatService.sendMessage(input, (messageEvent) => {
      event.sender.send(ipcChannels.chat.sendMessageEvent, messageEvent)
    })
  )
  ipcMain.handle(ipcChannels.chat.cancelOperation, (_event, input) =>
    chatService.cancelOperation(input)
  )
  ipcMain.handle(ipcChannels.chat.approveToolCall, (_event, input) =>
    chatService.approveToolCall(input)
  )
  ipcMain.handle(ipcChannels.chat.rejectToolCall, (_event, input) =>
    chatService.rejectToolCall(input)
  )
  ipcMain.handle(ipcChannels.settings.get, () => settingsService.getSettings())
  ipcMain.handle(ipcChannels.settings.createCustomProvider, async (_event, input) => {
    const settings = await settingsService.createCustomProvider(input)

    broadcastSettingsChange(settings)

    return settings
  })
  ipcMain.handle(ipcChannels.settings.createCustomAcpProvider, async (_event, input) => {
    const settings = await settingsService.createCustomAcpProvider(input)

    broadcastSettingsChange(settings)

    return settings
  })
  ipcMain.handle(ipcChannels.settings.saveProvider, async (_event, input) => {
    const settings = await settingsService.saveProvider(input)

    broadcastSettingsChange(settings)

    return settings
  })
  ipcMain.handle(ipcChannels.settings.deleteProvider, async (_event, input) => {
    const settings = await settingsService.deleteProvider(input)

    broadcastSettingsChange(settings)

    return settings
  })
  ipcMain.handle(ipcChannels.settings.fetchProviderModels, async (_event, input) => {
    const settings = await settingsService.fetchProviderModels(input)

    broadcastSettingsChange(settings)

    return settings
  })
  ipcMain.handle(ipcChannels.settings.testProvider, (_event, input) =>
    settingsService.testProvider(input)
  )
  ipcMain.handle(ipcChannels.settings.saveAppearance, async (_event, input) => {
    const settings = await settingsService.saveAppearance(input)

    broadcastSettingsChange(settings)

    return settings
  })
  ipcMain.handle(ipcChannels.window.close, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle(ipcChannels.window.minimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle(ipcChannels.window.toggleMaximize, (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)

    if (senderWindow === null) {
      return
    }

    if (senderWindow.isMaximized()) {
      senderWindow.unmaximize()
      return
    }

    senderWindow.maximize()
  })
  ipcMain.handle(ipcChannels.window.openSettings, (_event, input) => {
    openSettingsWindow(openSettingsInputSchema.parse(input))
  })
  ipcMain.handle(ipcChannels.window.getState, (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)

    return {
      isMaximized: senderWindow?.isMaximized() ?? false
    }
  })
}
