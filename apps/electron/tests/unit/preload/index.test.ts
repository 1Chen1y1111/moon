// @vitest-environment node

/**
 * 负责验证 preload 暴露的 MoonApi 形状和内部 transport routing。
 * 测试不触发真实 Electron、renderer 或 WebSocket 网络连接。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import type { MoonApi } from '@ipc/contracts'
import { workspaceWebSocketTransportInfoChannel } from '@ipc/workspace-transport-contract'
import { CLIENT_OPEN_EXTERNAL } from '@moon/server-core/transport'
import { PROTOCOL_VERSION, RPC_CHANNELS } from '@moon/shared/protocol'

const exposeInMainWorldMock = vi.fn()
const ipcInvokeMock = vi.fn()
const ipcOnMock = vi.fn()
const ipcOffMock = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock
  },
  ipcRenderer: {
    invoke: ipcInvokeMock,
    on: ipcOnMock,
    off: ipcOffMock
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
   * 记录 workspace request，并在微任务中回写同 id/channel 的 response envelope。
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
            clientId: 'client-1',
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
 * 让 fake ipcRenderer.invoke 返回同 id/channel 的 response envelope。
 */
function mockEnvelopeIpcInvoke(): void {
  ipcInvokeMock.mockImplementation((channel, envelope) => {
    if (channel === ipcChannels.rpc.request) {
      if (envelope.channel === workspaceWebSocketTransportInfoChannel) {
        return Promise.resolve({
          id: envelope.id,
          type: 'response',
          channel: envelope.channel,
          result: {
            authToken: 'workspace-secret',
            mode: 'local',
            url: 'ws://127.0.0.1:48123'
          }
        })
      }

      return Promise.resolve({
        id: envelope.id,
        type: 'response',
        channel: envelope.channel,
        result: undefined
      })
    }

    return Promise.resolve(undefined)
  })
}

describe('preload api', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorldMock.mockReset()
    ipcInvokeMock.mockReset()
    ipcOnMock.mockReset()
    ipcOffMock.mockReset()
    FakeWebSocket.instances = []
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: FakeWebSocket
    })
    Object.defineProperty(process, 'contextIsolated', {
      configurable: true,
      value: true
    })
  })

  it('exposes an openSettings window control bridge', async () => {
    await import('@preload/index')

    const apiCall = getExposedApi()

    expect(apiCall.windowControls.openSettings).toBeTypeOf('function')
    expect(exposeInMainWorldMock.mock.calls.some(([key]) => key === 'electron')).toBe(false)
  })

  it('routes app-shell through IPC and sessions through workspace WebSocket', async () => {
    const input = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    } as const

    mockEnvelopeIpcInvoke()
    await import('@preload/index')

    const api = getExposedApi()

    await api.settings.get()
    await api.chat.listSessions()
    await api.chat.getMessages({ sessionId: 'session-1' })
    await api.chat.listTopics({ sessionId: 'session-1' })
    await api.chat.listThreads({ topicId: 'topic-1' })
    await api.chat.createSession()
    await api.chat.deleteSession({ sessionId: 'session-1' })
    await api.chat.importAttachment({
      name: 'note.txt',
      mimeType: 'text/plain',
      size: 5,
      data: new ArrayBuffer(5)
    })
    await api.chat.createMessageTurn({ content: 'hello' })
    await api.chat.runOperation({ operationId: 'operation-1' })
    await api.chat.sendMessage({ content: 'hello' })
    await api.chat.cancelOperation({ operationId: 'operation-1' })
    await api.chat.approveToolCall({ toolInvocationId: 'tool-1' })
    await api.chat.rejectToolCall({ toolInvocationId: 'tool-1' })
    await api.settings.saveAppearance({ theme: 'dark' })
    await api.settings.saveProvider(input)
    await api.projects.list()
    await api.projects.getActive()
    await api.projects.useExistingFolder()
    await api.projects.delete({ projectId: 'project-1' })
    await api.projects.setActive({ projectId: 'project-1' })
    await api.windowControls.openSettings({ section: 'providers' })

    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: workspaceWebSocketTransportInfoChannel,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.settings.get,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.settings.saveProvider,
        args: [input]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.projects.setActive,
        args: [{ projectId: 'project-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.window.openSettings,
        args: [{ section: 'providers' }]
      })
    )

    const workspaceRequestChannels = FakeWebSocket.instances[0].sent
      .map((raw) => JSON.parse(raw))
      .filter((envelope) => envelope.type === 'request')
      .map((envelope) => envelope.channel)
    const workspaceHandshake = FakeWebSocket.instances[0].sent
      .map((raw) => JSON.parse(raw))
      .find((envelope) => envelope.type === 'handshake')

    expect(workspaceHandshake).toMatchObject({
      type: 'handshake',
      authToken: 'workspace-secret',
      clientCapabilities: [CLIENT_OPEN_EXTERNAL]
    })
    expect(workspaceRequestChannels).toEqual([
      RPC_CHANNELS.sessions.listSessions,
      RPC_CHANNELS.sessions.getMessages,
      RPC_CHANNELS.sessions.listTopics,
      RPC_CHANNELS.sessions.listThreads,
      RPC_CHANNELS.sessions.createSession,
      RPC_CHANNELS.sessions.deleteSession,
      RPC_CHANNELS.sessions.importAttachment,
      RPC_CHANNELS.sessions.createMessageTurn,
      RPC_CHANNELS.sessions.runOperation,
      RPC_CHANNELS.sessions.sendMessage,
      RPC_CHANNELS.sessions.cancelOperation,
      RPC_CHANNELS.sessions.approveToolCall,
      RPC_CHANNELS.sessions.rejectToolCall
    ])
    expect((api.windowControls as unknown as Record<string, unknown>).openExternal).toBeUndefined()
  })

  it('bridges openExternal capability requests to local envelope IPC', async () => {
    mockEnvelopeIpcInvoke()
    await import('@preload/index')

    const api = getExposedApi()

    await api.chat.listSessions()
    await flushPromises()

    const socket = FakeWebSocket.instances[0]

    socket.emit('message', {
      data: JSON.stringify({
        id: 'capability-request-1',
        type: 'request',
        channel: CLIENT_OPEN_EXTERNAL,
        args: ['https://moon.local/auth']
      })
    })
    await flushPromises()

    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.window.openExternal,
        args: [{ url: 'https://moon.local/auth' }]
      })
    )
    expect(socket.sent.map((raw) => JSON.parse(raw))).toContainEqual(
      expect.objectContaining({
        id: 'capability-request-1',
        type: 'response',
        channel: CLIENT_OPEN_EXTERNAL
      })
    )
  })

  it('cleans up the window state event subscription', async () => {
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()

    const unsubscribe = api.windowControls.onStateChange(listener)
    const handler = ipcOnMock.mock.calls.find(([channel]) => channel === ipcChannels.rpc.event)?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.(
      {},
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.window.onStateChange,
        args: [{ isMaximized: true }]
      }
    )
    unsubscribe()

    expect(listener).toHaveBeenCalledWith({ isMaximized: true })
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.rpc.event, handler)
  })

  it('cleans up the settings change event subscription', async () => {
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()
    const settings = createDefaultAppSettings()

    const unsubscribe = api.settings.onChange(listener)
    const handler = ipcOnMock.mock.calls.find(([channel]) => channel === ipcChannels.rpc.event)?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.(
      {},
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.settings.onChange,
        args: [settings]
      }
    )
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(settings)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.rpc.event, handler)
  })

  it('cleans up the unified session event subscription', async () => {
    mockEnvelopeIpcInvoke()
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    const unsubscribe = api.chat.onSessionEvent(listener)

    await flushPromises()
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      })
    })
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(ipcOffMock).not.toHaveBeenCalled()
  })

  it('cleans up the projects change event subscription', async () => {
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()
    const event = {
      activeProject: null,
      projects: []
    }

    const unsubscribe = api.projects.onChange(listener)
    const handler = ipcOnMock.mock.calls.find(([channel]) => channel === ipcChannels.rpc.event)?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.(
      {},
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.projects.onChange,
        args: [event]
      }
    )
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.rpc.event, handler)
  })
})
