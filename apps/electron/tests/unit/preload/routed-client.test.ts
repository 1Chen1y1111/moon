// @vitest-environment node

/**
 * 负责验证 preload RoutedClient 的 channel routing 行为。
 * 测试只覆盖 client 选择，不触发真实 Electron IPC 或远程 transport。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  CLIENT_TEST_ECHO,
  type RpcClientCapabilityHandler,
  type RpcClientPort
} from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import { RoutedClient } from '@preload/routed-client'

function createClientFixture(): {
  client: RpcClientPort
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  unsubscribe: ReturnType<typeof vi.fn>
} {
  const invoke = vi.fn()
  const unsubscribe = vi.fn()
  const on = vi.fn(() => unsubscribe)

  return {
    client: {
      invoke,
      on
    },
    invoke,
    on,
    unsubscribe
  }
}

function createCapabilityClientFixture(): ReturnType<typeof createClientFixture> & {
  handleCapability: ReturnType<typeof vi.fn>
} {
  const fixture = createClientFixture()
  const handleCapability = vi.fn((_channel: string, _handler: RpcClientCapabilityHandler) => {})

  return {
    ...fixture,
    client: {
      ...fixture.client,
      handleCapability
    },
    handleCapability
  }
}

describe('RoutedClient', () => {
  it('routes app-shell invokes to the local client', async () => {
    const local = createClientFixture()
    const workspace = createClientFixture()
    const client = new RoutedClient(local.client, workspace.client)
    const input = { section: 'providers' }

    local.invoke.mockResolvedValue(undefined)

    await client.invoke(RPC_CHANNELS.window.openSettings, input)

    expect(local.invoke).toHaveBeenCalledWith(RPC_CHANNELS.window.openSettings, input)
    expect(workspace.invoke).not.toHaveBeenCalled()
  })

  it('routes session invokes to the workspace client', async () => {
    const local = createClientFixture()
    const workspace = createClientFixture()
    const client = new RoutedClient(local.client, workspace.client)
    const input = { sessionId: 'session-1' }

    workspace.invoke.mockResolvedValue([{ id: 'message-1' }])

    await expect(client.invoke(RPC_CHANNELS.sessions.getMessages, input)).resolves.toEqual([
      { id: 'message-1' }
    ])

    expect(workspace.invoke).toHaveBeenCalledWith(RPC_CHANNELS.sessions.getMessages, input)
    expect(local.invoke).not.toHaveBeenCalled()
  })

  it('routes session event listeners to the workspace client', () => {
    const local = createClientFixture()
    const workspace = createClientFixture()
    const client = new RoutedClient(local.client, workspace.client)
    const listener = vi.fn()

    const unsubscribe = client.on(RPC_CHANNELS.sessions.event, listener)
    unsubscribe()

    expect(workspace.on).toHaveBeenCalledWith(RPC_CHANNELS.sessions.event, listener)
    expect(workspace.unsubscribe).toHaveBeenCalledOnce()
    expect(local.on).not.toHaveBeenCalled()
  })

  it('routes local event listeners to the local client', () => {
    const local = createClientFixture()
    const workspace = createClientFixture()
    const client = new RoutedClient(local.client, workspace.client)
    const listener = vi.fn()

    const unsubscribe = client.on(RPC_CHANNELS.settings.onChange, listener)
    unsubscribe()

    expect(local.on).toHaveBeenCalledWith(RPC_CHANNELS.settings.onChange, listener)
    expect(local.unsubscribe).toHaveBeenCalledOnce()
    expect(workspace.on).not.toHaveBeenCalled()
  })

  it('uses the local client as the workspace client by default', async () => {
    const local = createClientFixture()
    const client = new RoutedClient(local.client)

    local.invoke.mockResolvedValue([])

    await expect(client.invoke(RPC_CHANNELS.sessions.listSessions)).resolves.toEqual([])
    expect(local.invoke).toHaveBeenCalledWith(RPC_CHANNELS.sessions.listSessions)
  })

  it('registers client capabilities on the workspace client only', () => {
    const local = createCapabilityClientFixture()
    const workspace = createCapabilityClientFixture()
    const client = new RoutedClient(local.client, workspace.client)
    const handler = vi.fn()

    client.handleCapability(CLIENT_TEST_ECHO, handler)

    expect(workspace.handleCapability).toHaveBeenCalledWith(CLIENT_TEST_ECHO, handler)
    expect(local.handleCapability).not.toHaveBeenCalled()
  })

  it('ignores capability registration when the workspace client does not support it yet', () => {
    const local = createClientFixture()
    const workspace = createClientFixture()
    const client = new RoutedClient(local.client, workspace.client)

    expect(() => {
      client.handleCapability(CLIENT_TEST_ECHO, vi.fn())
    }).not.toThrow()
  })
})
