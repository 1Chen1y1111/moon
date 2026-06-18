// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import { RPC_CHANNELS } from '@moon/shared/protocol'

describe('ipcChannels', () => {
  it('defines chat IPC channels', () => {
    expect(ipcChannels.chat.listSessions).toBe('chat:listSessions')
    expect(ipcChannels.chat.getMessages).toBe('chat:getMessages')
    expect(ipcChannels.chat.listTopics).toBe('chat:listTopics')
    expect(ipcChannels.chat.listThreads).toBe('chat:listThreads')
    expect(ipcChannels.chat.createSession).toBe('chat:createSession')
    expect(ipcChannels.chat.deleteSession).toBe('chat:deleteSession')
    expect(ipcChannels.chat.importAttachment).toBe('chat:importAttachment')
    expect(ipcChannels.chat.createMessageTurn).toBe('chat:createMessageTurn')
    expect(ipcChannels.chat.runOperation).toBe('chat:runOperation')
    expect(ipcChannels.chat.sendMessage).toBe('chat:sendMessage')
    expect(ipcChannels.chat.cancelOperation).toBe('chat:cancelOperation')
    expect(ipcChannels.chat.approveToolCall).toBe('chat:approveToolCall')
    expect(ipcChannels.chat.rejectToolCall).toBe('chat:rejectToolCall')
    expect(ipcChannels.chat.sessionEvent).toBe(RPC_CHANNELS.sessions.event)
  })

  it('defines a dedicated channel for opening the settings window', () => {
    expect(ipcChannels.window.openSettings).toBe('window:open-settings')
  })

  it('defines project IPC channels', () => {
    expect(ipcChannels.projects.list).toBe('projects:list')
    expect(ipcChannels.projects.getActive).toBe('projects:get-active')
    expect(ipcChannels.projects.useExistingFolder).toBe('projects:use-existing-folder')
    expect(ipcChannels.projects.setActive).toBe('projects:set-active')
    expect(ipcChannels.projects.onChange).toBe('projects:on-change')
  })
})
