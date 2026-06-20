// @vitest-environment node

/**
 * 负责验证 Electron WebContents 到 legacy RPC client 的映射规则。
 * 测试只覆盖本地窗口 registry，不触发真实 BrowserWindow。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  }
}))

describe('legacy webContents client registry', () => {
  beforeEach(() => {
    getAllWindowsMock.mockReset()
  })

  it('uses the WebContents id string as the legacy client id', async () => {
    const { getLegacyWebContentsClientId } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )

    expect(getLegacyWebContentsClientId({ id: 12 })).toBe('12')
  })

  it('lists current BrowserWindow webContents clients', async () => {
    const { listLegacyWebContentsClients } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    expect(listLegacyWebContentsClients()).toEqual([
      { clientId: '1', webContents: firstWebContents },
      { clientId: '2', webContents: secondWebContents }
    ])
  })

  it('finds a single client by legacy client id', async () => {
    const { findLegacyWebContentsClient } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    expect(findLegacyWebContentsClient('2')).toEqual({
      clientId: '2',
      webContents: secondWebContents
    })
    expect(findLegacyWebContentsClient('3')).toBeUndefined()
  })
})
