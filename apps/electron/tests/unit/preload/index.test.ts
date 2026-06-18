// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import type { MoonApi } from '@ipc/contracts'

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

    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.settings.get)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.listSessions)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.getMessages, {
      sessionId: 'session-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.listTopics, {
      sessionId: 'session-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.listThreads, {
      topicId: 'topic-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.createSession)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.deleteSession, {
      sessionId: 'session-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.importAttachment, {
      name: 'note.txt',
      mimeType: 'text/plain',
      size: 5,
      data: expect.any(ArrayBuffer)
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.createMessageTurn, {
      content: 'hello'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.runOperation, {
      operationId: 'operation-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.sendMessage, { content: 'hello' })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.cancelOperation, {
      operationId: 'operation-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.approveToolCall, {
      toolInvocationId: 'tool-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.chat.rejectToolCall, {
      toolInvocationId: 'tool-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.settings.saveAppearance, {
      theme: 'dark'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.settings.saveProvider, input)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.projects.list)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.projects.getActive)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.projects.useExistingFolder)
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.projects.delete, {
      projectId: 'project-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.projects.setActive, {
      projectId: 'project-1'
    })
    expect(ipcInvokeMock).toHaveBeenCalledWith(ipcChannels.window.openSettings, {
      section: 'providers'
    })
  })

  it('cleans up the window state event subscription', async () => {
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()

    const unsubscribe = api.windowControls.onStateChange(listener)
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.window.onStateChange
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, { isMaximized: true })
    unsubscribe()

    expect(listener).toHaveBeenCalledWith({ isMaximized: true })
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.window.onStateChange, handler)
  })

  it('cleans up the settings change event subscription', async () => {
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    await import('@preload/index')

    const api = getExposedApi()
    const listener = vi.fn()
    const settings = createDefaultAppSettings()

    const unsubscribe = api.settings.onChange(listener)
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.settings.onChange
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, settings)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(settings)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.settings.onChange, handler)
  })

  it('cleans up the chat operation event subscription', async () => {
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

    const unsubscribe = api.chat.onOperationEvent(listener)
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.chat.operationEvent
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, event)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.chat.operationEvent, handler)
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
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.chat.sessionEvent
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, event)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, handler)
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
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.projects.onChange
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, event)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.projects.onChange, handler)
  })

  it('cleans up the legacy chat send message event subscription', async () => {
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

    const unsubscribe = api.chat.onSendMessageEvent(listener)
    const handler = ipcOnMock.mock.calls.find(
      ([channel]) => channel === ipcChannels.chat.sendMessageEvent
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, event)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(ipcOffMock).toHaveBeenCalledWith(ipcChannels.chat.sendMessageEvent, handler)
  })
})
