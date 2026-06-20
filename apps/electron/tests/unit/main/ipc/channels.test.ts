// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { ipcChannels } from '@ipc/channels'

describe('ipcChannels', () => {
  it('defines workspace envelope RPC IPC channels', () => {
    expect(ipcChannels.rpc.request).toBe('rpc:request')
    expect(ipcChannels.rpc.event).toBe('rpc:event')
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
