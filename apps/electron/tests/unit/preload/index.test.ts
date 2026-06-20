// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import type { MoonApi } from '@ipc/contracts'
import { RPC_CHANNELS } from '@moon/shared/protocol'

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

function getExposedApi(): MoonApi {
  return exposeInMainWorldMock.mock.calls.find(([key]) => key === 'api')?.[1] as MoonApi
}

describe('preload api', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorldMock.mockReset()
    ipcInvokeMock.mockReset()
    ipcOnMock.mockReset()
    ipcOffMock.mockReset()
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

  it('routes public api calls through the typed IPC channels', async () => {
    const input = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    } as const

    ipcInvokeMock.mockImplementation((channel, envelope) => {
      if (channel === ipcChannels.rpc.request) {
        return Promise.resolve({
          id: envelope.id,
          type: 'response',
          channel: envelope.channel,
          result: undefined
        })
      }

      return Promise.resolve(undefined)
    })

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
        channel: RPC_CHANNELS.settings.get,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.listSessions,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.getMessages,
        args: [{ sessionId: 'session-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.listTopics,
        args: [{ sessionId: 'session-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.listThreads,
        args: [{ topicId: 'topic-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.createSession,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.deleteSession,
        args: [{ sessionId: 'session-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.importAttachment,
        args: [
          {
            name: 'note.txt',
            mimeType: 'text/plain',
            size: 5,
            data: expect.any(ArrayBuffer)
          }
        ]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.createMessageTurn,
        args: [{ content: 'hello' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.runOperation,
        args: [{ operationId: 'operation-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.sendMessage,
        args: [{ content: 'hello' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.cancelOperation,
        args: [{ operationId: 'operation-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.approveToolCall,
        args: [{ toolInvocationId: 'tool-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.sessions.rejectToolCall,
        args: [{ toolInvocationId: 'tool-1' }]
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.settings.saveAppearance,
        args: [{ theme: 'dark' }]
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
        channel: RPC_CHANNELS.projects.list,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.projects.getActive,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.projects.useExistingFolder,
        args: []
      })
    )
    expect(ipcInvokeMock).toHaveBeenCalledWith(
      ipcChannels.rpc.request,
      expect.objectContaining({
        type: 'request',
        channel: RPC_CHANNELS.projects.delete,
        args: [{ projectId: 'project-1' }]
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
    const handler = ipcOnMock.mock.calls.find(([channel]) => channel === ipcChannels.rpc.event)?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.(
      {},
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      }
    )
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.rpc.event, handler)
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
