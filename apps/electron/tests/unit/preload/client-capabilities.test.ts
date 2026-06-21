// @vitest-environment node

/**
 * 负责验证 preload client capability host 只桥接到本地安全 RPC。
 * 测试不触发真实 Electron shell 或 WebSocket 连接。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  CLIENT_OPEN_EXTERNAL,
  CLIENT_TEST_ECHO,
  type RpcClientCapabilityHandler
} from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import {
  getPreloadClientCapabilityAllowlist,
  registerPreloadClientCapabilities
} from '@preload/client-capabilities'

/**
 * 创建可捕获 capability handler 的 fake workspace client。
 */
function createCapabilityClientFixture(): {
  handleCapability: ReturnType<typeof vi.fn>
  getHandler: (channel: string) => RpcClientCapabilityHandler | undefined
} {
  const handlers = new Map<string, RpcClientCapabilityHandler>()
  const handleCapability = vi.fn((channel: string, handler: RpcClientCapabilityHandler) => {
    handlers.set(channel, handler)
  })

  return {
    handleCapability,
    getHandler: (channel) => handlers.get(channel)
  }
}

describe('registerPreloadClientCapabilities', () => {
  it('allows only product preload capabilities', () => {
    expect(getPreloadClientCapabilityAllowlist()).toEqual([CLIENT_OPEN_EXTERNAL])
    expect(getPreloadClientCapabilityAllowlist()).not.toContain(CLIENT_TEST_ECHO)
  })

  it('bridges openExternal capability to the local window RPC channel', async () => {
    const capabilityClient = createCapabilityClientFixture()
    const localClient = {
      invoke: vi.fn(async () => undefined)
    }

    registerPreloadClientCapabilities(capabilityClient, localClient)

    const handler = capabilityClient.getHandler(CLIENT_OPEN_EXTERNAL)

    await expect(handler?.('https://moon.local/auth')).resolves.toBeUndefined()
    expect(capabilityClient.handleCapability).toHaveBeenCalledWith(
      CLIENT_OPEN_EXTERNAL,
      expect.any(Function)
    )
    expect(localClient.invoke).toHaveBeenCalledWith(RPC_CHANNELS.window.openExternal, {
      url: 'https://moon.local/auth'
    })
  })

  it('rejects non-string openExternal payloads before calling local RPC', async () => {
    const capabilityClient = createCapabilityClientFixture()
    const localClient = {
      invoke: vi.fn(async () => undefined)
    }

    registerPreloadClientCapabilities(capabilityClient, localClient)

    const handler = capabilityClient.getHandler(CLIENT_OPEN_EXTERNAL)

    await expect(handler?.({ url: 'https://moon.local/auth' })).rejects.toThrow(
      'client:openExternal requires a URL string'
    )
    expect(localClient.invoke).not.toHaveBeenCalled()
  })

  it('propagates local RPC failures to the capability response path', async () => {
    const capabilityClient = createCapabilityClientFixture()
    const localClient = {
      invoke: vi.fn(async () => {
        throw new Error('shell failed')
      })
    }

    registerPreloadClientCapabilities(capabilityClient, localClient)

    const handler = capabilityClient.getHandler(CLIENT_OPEN_EXTERNAL)

    await expect(handler?.('https://moon.local/auth')).rejects.toThrow('shell failed')
  })
})
