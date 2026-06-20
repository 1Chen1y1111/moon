// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { ipcChannels } from '@ipc/channels'

describe('ipcChannels', () => {
  it('defines unified envelope RPC IPC channels', () => {
    expect(ipcChannels.rpc.request).toBe('rpc:request')
    expect(ipcChannels.rpc.event).toBe('rpc:event')
  })
})
