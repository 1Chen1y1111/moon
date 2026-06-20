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
    const firstWebContents = { id: 101, send: vi.fn() }
    const secondWebContents = { id: 102, send: vi.fn() }

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    expect(listLegacyWebContentsClients()).toEqual([
      { clientId: '101', workspaceId: null, webContents: firstWebContents },
      { clientId: '102', workspaceId: null, webContents: secondWebContents }
    ])
  })

  it('finds a single client by legacy client id', async () => {
    const { findLegacyWebContentsClient } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const firstWebContents = { id: 201, send: vi.fn() }
    const secondWebContents = { id: 202, send: vi.fn() }

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    expect(findLegacyWebContentsClient('202')).toEqual({
      clientId: '202',
      workspaceId: null,
      webContents: secondWebContents
    })
    expect(findLegacyWebContentsClient('203')).toBeUndefined()
  })

  it('binds, overwrites, and clears workspace ids for clients', async () => {
    const {
      bindLegacyWebContentsClientWorkspace,
      findLegacyWebContentsClient,
      listLegacyWebContentsClientsByWorkspace
    } = await import('@main/bootstrap/legacy-webcontents-client-registry')
    const webContents = { id: 301, send: vi.fn() }

    getAllWindowsMock.mockReturnValue([{ webContents }])

    bindLegacyWebContentsClientWorkspace(webContents, 'workspace-1')

    expect(findLegacyWebContentsClient('301')?.workspaceId).toBe('workspace-1')
    expect(listLegacyWebContentsClientsByWorkspace('workspace-1')).toEqual([
      { clientId: '301', workspaceId: 'workspace-1', webContents }
    ])

    bindLegacyWebContentsClientWorkspace(webContents, 'workspace-2')

    expect(findLegacyWebContentsClient('301')?.workspaceId).toBe('workspace-2')
    expect(listLegacyWebContentsClientsByWorkspace('workspace-1')).toEqual([])

    bindLegacyWebContentsClientWorkspace(webContents, null)

    expect(findLegacyWebContentsClient('301')?.workspaceId).toBeNull()
    expect(listLegacyWebContentsClientsByWorkspace('workspace-2')).toEqual([])
  })

  it('lists only clients bound to the requested workspace', async () => {
    const { bindLegacyWebContentsClientWorkspace, listLegacyWebContentsClientsByWorkspace } =
      await import('@main/bootstrap/legacy-webcontents-client-registry')
    const firstWebContents = { id: 401, send: vi.fn() }
    const secondWebContents = { id: 402, send: vi.fn() }
    const thirdWebContents = { id: 403, send: vi.fn() }

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents },
      { webContents: thirdWebContents }
    ])

    bindLegacyWebContentsClientWorkspace(firstWebContents, 'workspace-1')
    bindLegacyWebContentsClientWorkspace(secondWebContents, 'workspace-2')

    expect(listLegacyWebContentsClientsByWorkspace('workspace-1')).toEqual([
      { clientId: '401', workspaceId: 'workspace-1', webContents: firstWebContents }
    ])
  })
})
