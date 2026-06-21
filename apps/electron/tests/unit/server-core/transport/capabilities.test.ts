// @vitest-environment node

/**
 * 负责验证 server-core client capability helper 的最小 contract。
 * 测试不连接真实 WebSocket，只确认 helper 的查找和反向调用语义。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  CLIENT_CAPABILITY_DEFINITIONS,
  CLIENT_OPEN_EXTERNAL,
  CLIENT_TEST_ECHO,
  findWorkspaceClientWithCapability,
  isClientCapabilityChannel,
  requestClientCapability,
  requestClientOpenExternal,
  requestClientTestEcho
} from '@moon/server-core/transport'

describe('client capability helpers', () => {
  it('keeps all capabilities registered with governance metadata', () => {
    expect(CLIENT_CAPABILITY_DEFINITIONS).toEqual({
      [CLIENT_TEST_ECHO]: {
        channel: CLIENT_TEST_ECHO,
        availability: 'test-only'
      },
      [CLIENT_OPEN_EXTERNAL]: {
        channel: CLIENT_OPEN_EXTERNAL,
        availability: 'product'
      }
    })
  })

  it('identifies only registered client capability channels', () => {
    expect(isClientCapabilityChannel(CLIENT_TEST_ECHO)).toBe(true)
    expect(isClientCapabilityChannel(CLIENT_OPEN_EXTERNAL)).toBe(true)
    expect(isClientCapabilityChannel('client:openPath')).toBe(false)
  })

  it('requests a typed capability through the shared helper', async () => {
    const invokeClient = vi.fn(async () => undefined)

    await expect(
      requestClientCapability(
        { invokeClient },
        'client-1',
        CLIENT_OPEN_EXTERNAL,
        'https://moon.local/auth'
      )
    ).resolves.toBeUndefined()
    expect(invokeClient).toHaveBeenCalledWith(
      'client-1',
      CLIENT_OPEN_EXTERNAL,
      'https://moon.local/auth'
    )
  })

  it('requests the safe echo capability through invokeClient', async () => {
    const invokeClient = vi.fn(async () => 'echo:hi')

    await expect(requestClientTestEcho({ invokeClient }, 'client-1', 'hi')).resolves.toBe(
      'echo:hi'
    )
    expect(invokeClient).toHaveBeenCalledWith('client-1', CLIENT_TEST_ECHO, 'hi')
  })

  it('requests the open external capability through invokeClient', async () => {
    const invokeClient = vi.fn(async () => undefined)

    await expect(
      requestClientOpenExternal({ invokeClient }, 'client-1', 'https://moon.local/auth')
    ).resolves.toBeUndefined()
    expect(invokeClient).toHaveBeenCalledWith(
      'client-1',
      CLIENT_OPEN_EXTERNAL,
      'https://moon.local/auth'
    )
  })

  it('finds the first matching workspace client for a capability', () => {
    const findClientsWithCapability = vi.fn(() => ['client-1', 'client-2'])

    expect(
      findWorkspaceClientWithCapability(
        { findClientsWithCapability },
        CLIENT_TEST_ECHO,
        'workspace-1'
      )
    ).toBe('client-1')
    expect(findClientsWithCapability).toHaveBeenCalledWith(CLIENT_TEST_ECHO, {
      workspaceId: 'workspace-1'
    })
  })

  it('returns null when no workspace client advertises the capability', () => {
    const findClientsWithCapability = vi.fn(() => [])

    expect(
      findWorkspaceClientWithCapability(
        { findClientsWithCapability },
        CLIENT_TEST_ECHO,
        'workspace-1'
      )
    ).toBeNull()
  })
})
