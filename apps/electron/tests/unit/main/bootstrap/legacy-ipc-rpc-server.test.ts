// @vitest-environment node

/**
 * 负责验证 Electron legacy IPC RPC server adapter 的 envelope 调度行为。
 * 测试只覆盖通用 transport adapter，不触发真实 Electron、renderer 或业务服务。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const handleMock = vi.fn()

vi.mock('electron', () => ({
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
})
