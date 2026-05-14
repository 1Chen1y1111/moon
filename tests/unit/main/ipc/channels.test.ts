// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { ipcChannels } from '@ipc/channels'

describe('ipcChannels', () => {
  it('defines chat IPC channels', () => {
    expect(ipcChannels.chat.listSessions).toBe('chat:listSessions')
    expect(ipcChannels.chat.getMessages).toBe('chat:getMessages')
    expect(ipcChannels.chat.listTopics).toBe('chat:listTopics')
    expect(ipcChannels.chat.listThreads).toBe('chat:listThreads')
    expect(ipcChannels.chat.createSession).toBe('chat:createSession')
    expect(ipcChannels.chat.importAttachment).toBe('chat:importAttachment')
    expect(ipcChannels.chat.sendMessage).toBe('chat:sendMessage')
    expect(ipcChannels.chat.cancelOperation).toBe('chat:cancelOperation')
    expect(ipcChannels.chat.approveToolCall).toBe('chat:approveToolCall')
    expect(ipcChannels.chat.rejectToolCall).toBe('chat:rejectToolCall')
    expect(ipcChannels.chat.sendMessageEvent).toBe('chat:sendMessageEvent')
  })

  it('defines a dedicated channel for opening the settings window', () => {
    expect(ipcChannels.window.openSettings).toBe('window:open-settings')
  })
})
