// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorldMock = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock
  },
  ipcRenderer: {
    invoke: vi.fn()
  }
}))

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {}
}))

describe('preload api', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorldMock.mockReset()
    Object.defineProperty(process, 'contextIsolated', {
      configurable: true,
      value: true
    })
  })

  it('exposes an openSettings window control bridge', async () => {
    await import('../../preload/index')

    const apiCall = exposeInMainWorldMock.mock.calls.find(([key]) => key === 'api')?.[1]

    expect(apiCall.windowControls.openSettings).toBeTypeOf('function')
  })
})
