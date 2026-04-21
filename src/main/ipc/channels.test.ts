// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { ipcChannels } from '../../shared/ipc/channels'

describe('ipcChannels', () => {
  it('defines a dedicated channel for opening the settings window', () => {
    expect(ipcChannels.window.openSettings).toBe('window:open-settings')
  })
})
