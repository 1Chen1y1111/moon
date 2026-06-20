// @vitest-environment node

/**
 * 负责验证 Electron legacy IPC RPC server adapter 的 envelope 调度行为。
 * 测试只覆盖通用 transport adapter，不触发真实 Electron、renderer 或业务服务。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const handleMock = vi.fn()
const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  },
  ipcMain: {
    handle: handleMock
  }
}))

function getRegisteredHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  return handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
}

describe('createLegacyIpcRpcServer', () => {
  beforeEach(() => {
    handleMock.mockReset()
    getAllWindowsMock.mockReset()
  })

  it('returns legacy IPC results through the envelope dispatcher', async () => {
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:echo': 'legacy:echo' },
      createContext: () => ({ requestId: 'request-1' })
    })

    rpcServer.handle('demo:echo', () => ({ ok: true }))

    const registeredHandler = getRegisteredHandler('legacy:echo')

    expect(registeredHandler).toBeTypeOf('function')
    await expect(registeredHandler?.({ sender: {} })).resolves.toEqual({ ok: true })
  })

  it('passes IPC args to the registered RPC handler unchanged', async () => {
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const handler = vi.fn((_context, ...args: unknown[]) => args)
    const context = { requestId: 'request-1' }
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:args': 'legacy:args' },
      createContext: () => context
    })

    rpcServer.handle('demo:args', handler)

    const registeredHandler = getRegisteredHandler('legacy:args')
    const firstArg = { id: 'one' }
    const secondArg = ['two']

    await expect(registeredHandler?.({ sender: {} }, firstArg, secondArg)).resolves.toEqual([
      firstArg,
      secondArg
    ])
    expect(handler).toHaveBeenCalledWith(context, firstArg, secondArg)
  })

  it('rejects legacy IPC calls with HANDLER_ERROR for ordinary handler errors', async () => {
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:error': 'legacy:error' },
      createContext: () => ({ requestId: 'request-1' })
    })

    rpcServer.handle('demo:error', () => {
      throw new Error('boom')
    })

    const registeredHandler = getRegisteredHandler('legacy:error')

    expect(registeredHandler).toBeTypeOf('function')

    try {
      await registeredHandler?.({ sender: {} })
      throw new Error('expected handler to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('boom')
      expect((error as Error & { code?: string }).code).toBe('HANDLER_ERROR')
    }
  })

  it('preserves CodedError codes when legacy IPC calls reject', async () => {
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const { CodedError } = await import('@moon/shared/protocol')
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:timeout': 'legacy:timeout' },
      createContext: () => ({ requestId: 'request-1' })
    })

    rpcServer.handle('demo:timeout', () => {
      throw new CodedError('REQUEST_TIMEOUT', 'too slow')
    })

    const registeredHandler = getRegisteredHandler('legacy:timeout')

    expect(registeredHandler).toBeTypeOf('function')

    try {
      await registeredHandler?.({ sender: {} })
      throw new Error('expected handler to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('too slow')
      expect((error as Error & { code?: string }).code).toBe('REQUEST_TIMEOUT')
    }
  })

  it('throws a clear error when registering an unknown RPC channel', async () => {
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:known': 'legacy:known' },
      createContext: () => ({ requestId: 'request-1' })
    })

    expect(() => {
      rpcServer.handle('demo:missing', () => undefined)
    }).toThrow('Unsupported legacy IPC RPC channel: demo:missing')
  })

  it('creates request context for each IPC event', async () => {
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const createContext = vi.fn((event: { requestId: string }) => ({
      requestId: event.requestId
    }))
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:context': 'legacy:context' },
      createContext
    })

    rpcServer.handle('demo:context', (context) => context)

    const registeredHandler = getRegisteredHandler('legacy:context')
    const firstEvent = { requestId: 'first' }
    const secondEvent = { requestId: 'second' }

    await expect(registeredHandler?.(firstEvent)).resolves.toEqual({ requestId: 'first' })
    await expect(registeredHandler?.(secondEvent)).resolves.toEqual({ requestId: 'second' })
    expect(createContext).toHaveBeenCalledWith(firstEvent)
    expect(createContext).toHaveBeenCalledWith(secondEvent)
  })

  it('pushes RPC events to all legacy windows', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }
    const settings = createDefaultAppSettings()
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:known': 'legacy:known' },
      createContext: () => ({ requestId: 'request-1' })
    })

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    rpcServer.push(RPC_CHANNELS.settings.onChange, { to: 'all' }, settings)

    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
  })

  it('honors all-window push exclusions by WebContents id', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }
    const settings = createDefaultAppSettings()
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:known': 'legacy:known' },
      createContext: () => ({ requestId: 'request-1' })
    })

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    rpcServer.push(RPC_CHANNELS.settings.onChange, { to: 'all', exclude: '2' }, settings)

    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).not.toHaveBeenCalled()
  })

  it('pushes RPC events to a single legacy client window', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }
    const state = { isMaximized: true }
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:known': 'legacy:known' },
      createContext: () => ({ requestId: 'request-1' })
    })

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    rpcServer.push(RPC_CHANNELS.window.onStateChange, { to: 'client', clientId: '2' }, state)

    expect(firstWebContents.send).not.toHaveBeenCalled()
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.window.onStateChange, state)
  })

  it('pushes RPC events to legacy clients bound to a workspace', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { createLegacyIpcRpcServer } = await import('@main/bootstrap/legacy-ipc-rpc-server')
    const { bindLegacyWebContentsClientWorkspace } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }
    const settings = createDefaultAppSettings()
    const rpcServer = createLegacyIpcRpcServer({
      channelMap: { 'demo:known': 'legacy:known' },
      createContext: () => ({ requestId: 'request-1' })
    })

    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])
    bindLegacyWebContentsClientWorkspace(firstWebContents, 'workspace-1')
    bindLegacyWebContentsClientWorkspace(secondWebContents, 'workspace-2')

    rpcServer.push(RPC_CHANNELS.settings.onChange, { to: 'workspace', workspaceId: 'workspace-1' }, settings)

    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).not.toHaveBeenCalled()
  })
})
