// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: unknown[]) => void

const createServerMock = vi.fn()

vi.mock('node:http', () => ({
  createServer: createServerMock
}))

function createFakeServer(): {
  close: ReturnType<typeof vi.fn>
  closeAllConnections: ReturnType<typeof vi.fn>
  closeIdleConnections: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
  listen: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<string, Handler[]>()
  const server = {
    close: vi.fn((callback?: (error?: Error) => void) => {
      callback?.()
    }),
    closeAllConnections: vi.fn(),
    closeIdleConnections: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      handlers.get(event)?.forEach((handler) => {
        handler(...args)
      })
    },
    listen: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      const eventHandlers = handlers.get(event) ?? []

      eventHandlers.push(handler)
      handlers.set(event, eventHandlers)
    })
  }

  return server
}

function createFakeSocket(): {
  destroy: ReturnType<typeof vi.fn>
  emit: (event: string) => void
  on: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<string, Handler[]>()
  const socket = {
    destroy: vi.fn(),
    emit: (event: string) => {
      handlers.get(event)?.forEach((handler) => {
        handler()
      })
    },
    on: vi.fn((event: string, handler: Handler) => {
      const eventHandlers = handlers.get(event) ?? []

      eventHandlers.push(handler)
      handlers.set(event, eventHandlers)
    })
  }

  return socket
}

describe('ProviderProxyServer', () => {
  beforeEach(() => {
    vi.resetModules()
    createServerMock.mockReset()
  })

  it('closes listening, idle, and active socket connections when stopped', async () => {
    const fakeServer = createFakeServer()

    createServerMock.mockReturnValue(fakeServer)

    const { ProviderProxyServer } = await import('@main/services/provider-proxy-server')
    const proxyServer = new ProviderProxyServer({} as never)

    proxyServer.start()

    const socket = createFakeSocket()

    fakeServer.emit('connection', socket)

    await proxyServer.stop()

    expect(fakeServer.closeIdleConnections).toHaveBeenCalledTimes(1)
    expect(fakeServer.close).toHaveBeenCalledTimes(1)
    expect(fakeServer.closeAllConnections).toHaveBeenCalledTimes(1)
    expect(socket.destroy).toHaveBeenCalledTimes(1)
  })

  it('does not destroy sockets that have already closed before stop', async () => {
    const fakeServer = createFakeServer()

    createServerMock.mockReturnValue(fakeServer)

    const { ProviderProxyServer } = await import('@main/services/provider-proxy-server')
    const proxyServer = new ProviderProxyServer({} as never)

    proxyServer.start()

    const socket = createFakeSocket()

    fakeServer.emit('connection', socket)
    socket.emit('close')

    await proxyServer.stop()

    expect(socket.destroy).not.toHaveBeenCalled()
  })
})
