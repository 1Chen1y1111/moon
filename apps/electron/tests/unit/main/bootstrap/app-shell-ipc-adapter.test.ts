// @vitest-environment node

/**
 * 负责验证 app-shell IPC adapter 会把 shared RPC channel 映射到现有 legacy IPC channel。
 * 测试只覆盖 transport adapter，不触发真实 Electron、renderer 或业务服务。
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

describe('createAppShellIpcRpcServer', () => {
  beforeEach(() => {
    handleMock.mockReset()
  })

  it('maps app-shell RPC channels to legacy IPC channels', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createAppShellIpcRpcServer } = await import('@main/bootstrap/app-shell-ipc-adapter')
    const rpcServer = createAppShellIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.settings.get, () => ({ theme: 'dark' }))
    rpcServer.handle(RPC_CHANNELS.projects.list, () => [{ id: 'project-1' }])
    rpcServer.handle(RPC_CHANNELS.window.getState, () => ({ isMaximized: false }))

    await expect(getRegisteredHandler(ipcChannels.settings.get)?.({ sender: {} })).resolves.toEqual(
      { theme: 'dark' }
    )
    await expect(getRegisteredHandler(ipcChannels.projects.list)?.({ sender: {} })).resolves.toEqual(
      [{ id: 'project-1' }]
    )
    await expect(getRegisteredHandler(ipcChannels.window.getState)?.({ sender: {} })).resolves.toEqual(
      { isMaximized: false }
    )
  })

  it('does not register event-only app-shell channels as invoke handlers', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createAppShellIpcRpcServer } = await import('@main/bootstrap/app-shell-ipc-adapter')
    const rpcServer = createAppShellIpcRpcServer()

    expect(() => rpcServer.handle(RPC_CHANNELS.settings.onChange, () => undefined)).toThrow(
      'Unsupported legacy IPC RPC channel: settings:onChange'
    )
    expect(() => rpcServer.handle(RPC_CHANNELS.projects.onChange, () => undefined)).toThrow(
      'Unsupported legacy IPC RPC channel: projects:onChange'
    )
    expect(() => rpcServer.handle(RPC_CHANNELS.window.onStateChange, () => undefined)).toThrow(
      'Unsupported legacy IPC RPC channel: window:onStateChange'
    )
  })

  it('returns handler results and preserves coded errors through the legacy envelope adapter', async () => {
    const { ipcChannels } = await import('@ipc/channels')
    const { CodedError, RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createAppShellIpcRpcServer } = await import('@main/bootstrap/app-shell-ipc-adapter')
    const rpcServer = createAppShellIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.settings.testProvider, (_context, input) => input)
    rpcServer.handle(RPC_CHANNELS.settings.deleteProvider, () => {
      throw new CodedError('REQUEST_TIMEOUT', 'too slow')
    })

    await expect(
      getRegisteredHandler(ipcChannels.settings.testProvider)?.({ sender: {} }, { provider: 'x' })
    ).resolves.toEqual({ provider: 'x' })

    try {
      await getRegisteredHandler(ipcChannels.settings.deleteProvider)?.(
        { sender: {} },
        { provider: 'x' }
      )
      throw new Error('expected handler to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('too slow')
      expect((error as Error & { code?: string }).code).toBe('REQUEST_TIMEOUT')
    }
  })
})
