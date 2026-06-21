// @vitest-environment node

/**
 * 负责验证 Electron workspace WebSocket wrapper 的启动适配行为。
 * 具体 handshake、heartbeat 和 push routing 由 server-core transport 测试覆盖。
 */

import { describe, expect, it, vi } from 'vitest'

import { createWorkspaceWebSocketRpcServer } from '@main/bootstrap/workspace-websocket-rpc-server'
import { CLIENT_TEST_ECHO } from '@moon/server-core/transport'

type FakeServerEvent = 'connection' | 'listening' | 'error'

class FakeSocketServer {
  readonly close = vi.fn((callback?: (error?: Error) => void) => {
    callback?.()
  })
  private readonly listeners = new Map<FakeServerEvent, Array<(...args: unknown[]) => void>>()

  /**
   * 返回已绑定的 fake TCP port。
   */
  address(): { port: number } {
    return { port: 48123 }
  }

  /**
   * 注册 fake server 事件监听器。
   */
  on(event: FakeServerEvent, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }
}

describe('createWorkspaceWebSocketRpcServer', () => {
  it('wraps the server-core transport URL as local Electron transport info', async () => {
    const fakeServer = new FakeSocketServer()
    const createWebSocketServer = vi.fn(() => fakeServer)
    const server = createWorkspaceWebSocketRpcServer({
      createAuthToken: () => 'local-workspace-secret',
      createClientId: () => 'client-1',
      createWebSocketServer
    })

    await expect(server.getTransportInfo()).resolves.toEqual({
      authToken: 'local-workspace-secret',
      mode: 'local',
      url: 'ws://127.0.0.1:48123'
    })

    expect(createWebSocketServer).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 0
    })
  })

  it('closes the injected WebSocket server through the server-core runtime', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportInfo()
    await server.close()

    expect(fakeServer.close).toHaveBeenCalledOnce()
  })

  it('forwards client capability APIs through the server-core runtime', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportInfo()

    expect(server.hasClientCapability('client-1', CLIENT_TEST_ECHO)).toBe(false)
    expect(
      server.findClientsWithCapability(CLIENT_TEST_ECHO, { workspaceId: 'workspace-1' })
    ).toEqual([])
    await expect(server.invokeClient('client-1', CLIENT_TEST_ECHO, 'hi')).rejects.toMatchObject({
      code: 'CLIENT_DISCONNECTED'
    })
  })
})
