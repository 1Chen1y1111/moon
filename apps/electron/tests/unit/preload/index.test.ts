// @vitest-environment node

/**
 * 验证 preload 按 Craft 风格创建 WS RPC client，并暴露稳定的 MoonApi。
 * 测试使用 fake WebSocket，不触发真实 Electron 或网络。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MoonApi } from '@ipc/contracts'
import {
  localWebSocketTransportInfoChannel,
  webContentsIdChannel
} from '@ipc/workspace-transport-contract'
import { CLIENT_OPEN_EXTERNAL } from '@moon/server-core/transport'
import { PROTOCOL_VERSION, RPC_CHANNELS } from '@moon/shared/protocol'

const exposeInMainWorldMock = vi.fn()
const ipcInvokeMock = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock
  },
  ipcRenderer: {
    invoke: ipcInvokeMock
  }
}))

type FakeWebSocketEvent = 'open' | 'message' | 'close' | 'error'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readonly sent: string[] = []
  readyState = 0
  private readonly listeners = new Map<
    FakeWebSocketEvent,
    Array<(event: { data?: unknown }) => void>
  >()

  /**
   * 创建 fake WebSocket，并在微任务中模拟连接成功。
   */
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.emit('open')
    })
  }

  /**
   * 注册 fake WebSocket 事件监听器。
   */
  addEventListener(event: FakeWebSocketEvent, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }

  /**
   * 移除 fake WebSocket 事件监听器。
   */
  removeEventListener(
    event: FakeWebSocketEvent,
    listener: (event: { data?: unknown }) => void
  ): void {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener)
    )
  }

  /**
   * 记录 client 发出的 envelope，并为 handshake/request 自动回写成功响应。
   */
  send(data: string): void {
    this.sent.push(data)
    const request = JSON.parse(data)

    if (request.type === 'handshake') {
      queueMicrotask(() => {
        this.emit('message', {
          data: JSON.stringify({
            id: request.id,
            type: 'handshake_ack',
            clientId: `client-${FakeWebSocket.instances.indexOf(this) + 1}`,
            protocolVersion: PROTOCOL_VERSION
          })
        })
      })
      return
    }

    if (request.type === 'request') {
      queueMicrotask(() => {
        this.emit('message', {
          data: JSON.stringify({
            id: request.id,
            type: 'response',
            channel: request.channel,
            result: undefined
          })
        })
      })
    }
  }

  /**
   * 关闭 fake WebSocket。
   */
  close(): void {
    this.readyState = 3
    this.emit('close')
  }

  /**
   * 触发 fake WebSocket 事件。
   */
  emit(event: FakeWebSocketEvent, payload: { data?: unknown } = {}): void {
    this.listeners.get(event)?.forEach((listener) => {
      listener(payload)
    })
  }
}

/**
 * 读取 preload 注入的 MoonApi。
 */
function getExposedApi(): MoonApi {
  return exposeInMainWorldMock.mock.calls.find(([key]) => key === 'api')?.[1] as MoonApi
}

/**
 * 等待 fake WebSocket 的微任务 response 被消费。
 */
async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * 安装 preload discovery IPC 的默认返回值。
 */
function mockDiscoveryIpc(): void {
  ipcInvokeMock.mockImplementation((channel) => {
    if (channel === localWebSocketTransportInfoChannel) {
      return Promise.resolve({
        authToken: 'local-secret',
        mode: 'local',
        url: 'ws://127.0.0.1:48123'
      })
    }

    if (channel === webContentsIdChannel) {
      return Promise.resolve(42)
    }

    return Promise.resolve(undefined)
  })
}

/**
 * 读取指定 fake socket 发出的 request channel。
 */
function getSentRequestChannels(socket: FakeWebSocket): string[] {
  return socket.sent
    .map((item) => JSON.parse(item))
    .filter((envelope) => envelope.type === 'request')
    .map((envelope) => envelope.channel)
}

describe('preload api', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    exposeInMainWorldMock.mockReset()
    ipcInvokeMock.mockReset()
    FakeWebSocket.instances = []
    mockDiscoveryIpc()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    Object.defineProperty(process, 'contextIsolated', {
      configurable: true,
      value: true
    })
    delete process.env.MOON_WORKSPACE_ID
    delete process.env.MOON_WORKSPACE_WS_TOKEN
    delete process.env.MOON_WORKSPACE_WS_URL
  })

  it('exposes MoonApi and connects the local WS client with webContents identity', async () => {
    await import('@preload/index')
    await flushPromises()

    const api = getExposedApi()
    const [socket] = FakeWebSocket.instances
    const handshake = JSON.parse(socket.sent[0])

    expect(api.sessions.createMessageTurn).toBeTypeOf('function')
    expect(api.windowControls.getState).toBeTypeOf('function')
    expect(ipcInvokeMock).toHaveBeenCalledWith(localWebSocketTransportInfoChannel)
    expect(ipcInvokeMock).toHaveBeenCalledWith(webContentsIdChannel)
    expect(socket.url).toBe('ws://127.0.0.1:48123')
    expect(handshake).toMatchObject({
      authToken: 'local-secret',
      protocolVersion: PROTOCOL_VERSION,
      type: 'handshake',
      webContentsId: 42
    })
  })

  it('routes local-only and session calls through the same local WS client by default', async () => {
    await import('@preload/index')
    await flushPromises()

    const api = getExposedApi()

    await api.settings.get()
    await api.sessions.listSessions()
    await flushPromises()

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(getSentRequestChannels(FakeWebSocket.instances[0])).toEqual([
      RPC_CHANNELS.settings.get,
      RPC_CHANNELS.sessions.listSessions
    ])
  })

  it('routes sessions to a remote WS client when remote workspace env is configured', async () => {
    process.env.MOON_WORKSPACE_WS_URL = ' ws://remote.local:49000 '
    process.env.MOON_WORKSPACE_WS_TOKEN = ' remote-secret '
    process.env.MOON_WORKSPACE_ID = ' remote-workspace-1 '

    await import('@preload/index')
    await flushPromises()

    const api = getExposedApi()

    await api.settings.get()
    await api.sessions.listSessions()
    await flushPromises()

    expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual([
      'ws://127.0.0.1:48123',
      'ws://remote.local:49000'
    ])
    expect(getSentRequestChannels(FakeWebSocket.instances[0])).toContain(RPC_CHANNELS.settings.get)
    expect(getSentRequestChannels(FakeWebSocket.instances[1])).toContain(
      RPC_CHANNELS.sessions.listSessions
    )
    expect(JSON.parse(FakeWebSocket.instances[1].sent[0])).toMatchObject({
      authToken: 'remote-secret',
      type: 'handshake',
      webContentsId: 42,
      workspaceId: 'remote-workspace-1'
    })
  })

  it('bridges server capability requests back through the local WS client', async () => {
    process.env.MOON_WORKSPACE_WS_URL = 'ws://remote.local:49000'

    await import('@preload/index')
    await flushPromises()

    const remoteSocket = FakeWebSocket.instances[1]

    remoteSocket.emit('message', {
      data: JSON.stringify({
        id: 'capability-1',
        type: 'request',
        channel: CLIENT_OPEN_EXTERNAL,
        args: ['https://moon.local/auth']
      })
    })
    await flushPromises()

    expect(getSentRequestChannels(FakeWebSocket.instances[0])).toContain(
      RPC_CHANNELS.window.openExternal
    )
    expect(JSON.parse(remoteSocket.sent.at(-1) ?? '{}')).toMatchObject({
      id: 'capability-1',
      type: 'response'
    })
  })

  it('delivers and cleans up WS event subscriptions', async () => {
    await import('@preload/index')
    await flushPromises()

    const api = getExposedApi()
    const listener = vi.fn()
    const unsubscribe = api.settings.onChange(listener)
    const socket = FakeWebSocket.instances[0]
    const eventEnvelope = {
      id: 'event-1',
      type: 'event',
      channel: RPC_CHANNELS.settings.onChange,
      args: [{ theme: 'dark' }]
    }

    socket.emit('message', { data: JSON.stringify(eventEnvelope) })
    unsubscribe()
    socket.emit('message', { data: JSON.stringify(eventEnvelope) })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ theme: 'dark' })
  })
})
