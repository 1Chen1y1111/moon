// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const removeHandlerMock = vi.fn()
const handleMock = vi.fn()
const fromWebContentsMock = vi.fn()
const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
    getAllWindows: getAllWindowsMock
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock
  }
}))

function getRegisteredHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  return handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
}

async function dispatchRpcRequest(
  rpcRequestChannel: string,
  event: unknown,
  channel: string,
  args: unknown[] = []
): Promise<unknown> {
  const handler = getRegisteredHandler(rpcRequestChannel)

  expect(handler).toBeTypeOf('function')

  const response = await handler?.(event, {
    id: 'request-1',
    type: 'request',
    channel,
    args
  })

  expect(response).toMatchObject({
    id: 'request-1',
    type: 'response',
    channel
  })

  return (response as { result?: unknown }).result
}

function createWorkspaceRpcServerFixture() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const close = vi.fn(async () => undefined)
  const getTransportInfo = vi.fn(async () => ({
    mode: 'local',
    url: 'ws://127.0.0.1:48123'
  }))
  const push = vi.fn()

  return {
    server: {
      close,
      getTransportInfo,
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      },
      push
    },
    close,
    getHandler: (channel: string) => handlers.get(channel),
    getTransportInfo,
    push
  }
}

describe('registerIpcHandlers', () => {
  const chatService = {
    approveToolCall: vi.fn(),
    cancelOperation: vi.fn(),
    createMessageTurn: vi.fn(),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    getMessages: vi.fn(),
    importAttachment: vi.fn(),
    listThreads: vi.fn(),
    listSessions: vi.fn(),
    listTopics: vi.fn(),
    rejectToolCall: vi.fn(),
    runOperation: vi.fn(),
    sendMessage: vi.fn()
  }
  const settingsService = {
    getSettings: vi.fn(),
    saveAppearance: vi.fn(),
    saveProvider: vi.fn()
  }
  const projectsService = {
    createChangeEvent: vi.fn(),
    deleteProject: vi.fn(),
    getActiveProject: vi.fn(),
    listProjects: vi.fn(),
    setActiveProject: vi.fn(),
    useExistingFolder: vi.fn()
  }
  const openSettingsWindow = vi.fn()

  beforeEach(() => {
    delete process.env.MOON_WORKSPACE_WS_URL
    removeHandlerMock.mockReset()
    handleMock.mockReset()
    fromWebContentsMock.mockReset()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([])
    chatService.approveToolCall.mockReset()
    chatService.cancelOperation.mockReset()
    chatService.createMessageTurn.mockReset()
    chatService.createSession.mockReset()
    chatService.deleteSession.mockReset()
    chatService.getMessages.mockReset()
    chatService.importAttachment.mockReset()
    chatService.listThreads.mockReset()
    chatService.listSessions.mockReset()
    chatService.listTopics.mockReset()
    chatService.rejectToolCall.mockReset()
    chatService.runOperation.mockReset()
    chatService.sendMessage.mockReset()
    settingsService.getSettings.mockReset()
    settingsService.saveAppearance.mockReset()
    settingsService.saveProvider.mockReset()
    projectsService.createChangeEvent.mockReset()
    projectsService.deleteProject.mockReset()
    projectsService.getActiveProject.mockReset()
    projectsService.listProjects.mockReset()
    projectsService.setActiveProject.mockReset()
    projectsService.useExistingFolder.mockReset()
    openSettingsWindow.mockReset()
  })

  afterEach(() => {
    delete process.env.MOON_WORKSPACE_WS_URL
  })

  it('registers a single unified rpc request handler', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(removeHandlerMock).toHaveBeenCalledTimes(1)
    expect(removeHandlerMock).toHaveBeenCalledWith(ipcChannels.rpc.request)
    expect(handleMock.mock.calls.map(([channel]) => channel)).toEqual([ipcChannels.rpc.request])
  })

  it('returns cleanup that closes the workspace RPC server', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const workspace = createWorkspaceRpcServerFixture()

    const registeredHandlers = registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await registeredHandlers.close()

    expect(workspace.close).toHaveBeenCalledOnce()
  })

  it('returns local workspace transport info through the unified rpc handler', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { workspaceWebSocketTransportInfoChannel } = await import(
      '@ipc/workspace-transport-contract'
    )
    const workspace = createWorkspaceRpcServerFixture()

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(workspace.getTransportInfo).not.toHaveBeenCalled()
    await expect(
      dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: {} },
        workspaceWebSocketTransportInfoChannel
      )
    ).resolves.toEqual({
      mode: 'local',
      url: 'ws://127.0.0.1:48123'
    })
    expect(workspace.getTransportInfo).toHaveBeenCalledOnce()
  })

  it('returns remote workspace transport info without creating the local workspace server', async () => {
    process.env.MOON_WORKSPACE_WS_URL = ' ws://remote-workspace.local:48123 '
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { workspaceWebSocketTransportInfoChannel } = await import(
      '@ipc/workspace-transport-contract'
    )
    const createWorkspaceRpcServer = vi.fn()

    const registeredHandlers = registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(
      dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: {} },
        workspaceWebSocketTransportInfoChannel
      )
    ).resolves.toEqual({
      mode: 'remote',
      url: 'ws://remote-workspace.local:48123'
    })
    await expect(registeredHandlers.close()).resolves.toBeUndefined()
    expect(createWorkspaceRpcServer).not.toHaveBeenCalled()
  })

  it('registers settings handlers that delegate through the settings service', async () => {
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const settings = createDefaultAppSettings()
    const input = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    }

    settingsService.getSettings.mockResolvedValue(settings)
    settingsService.saveAppearance.mockResolvedValue(settings)
    settingsService.saveProvider.mockResolvedValue(settings)

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(
      await dispatchRpcRequest(ipcChannels.rpc.request, { sender: {} }, RPC_CHANNELS.settings.get)
    ).toBe(settings)
    expect(
      await dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: {} },
        RPC_CHANNELS.settings.saveAppearance,
        [{ theme: 'dark' }]
      )
    ).toBe(settings)
    expect(
      await dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: {} },
        RPC_CHANNELS.settings.saveProvider,
        [input]
      )
    ).toBe(settings)
    expect(settingsService.saveAppearance).toHaveBeenCalledWith({ theme: 'dark' })
    expect(settingsService.saveProvider).toHaveBeenCalledWith(input)
  })

  it('registers chat handlers on the workspace RPC server', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const workspace = createWorkspaceRpcServerFixture()
    const session = {
      id: 'session-1',
      projectId: null,
      provider: 'openai',
      title: '新聊天',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const message = {
      id: 'message-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      role: 'user',
      content: 'hello',
      status: 'complete',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const operation = {
      id: 'operation-1',
      appContext: { sessionId: 'session-1' },
      topicId: 'topic-1',
      threadId: 'thread-1',
      status: 'done',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:01.000Z',
      completedAt: '2026-05-09T00:00:01.000Z'
    }
    const emitSessionEvent = vi.fn()

    chatService.listSessions.mockResolvedValue([session])
    chatService.getMessages.mockResolvedValue([message])
    chatService.runOperation.mockResolvedValue({
      operation,
      messages: [message]
    })

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(workspace.getHandler(RPC_CHANNELS.sessions.listSessions)?.({})).resolves.toEqual([
      session
    ])
    await expect(
      workspace.getHandler(RPC_CHANNELS.sessions.getMessages)?.({}, { sessionId: 'session-1' })
    ).resolves.toEqual([message])
    await expect(
      workspace.getHandler(RPC_CHANNELS.sessions.runOperation)?.(
        { emitSessionEvent },
        { operationId: 'operation-1' }
      )
    ).resolves.toEqual({
      operation,
      messages: [message]
    })

    expect(chatService.getMessages).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(chatService.runOperation).toHaveBeenCalledWith(
      { operationId: 'operation-1' },
      expect.any(Function)
    )

    const operationEventListener = chatService.runOperation.mock.calls[0][1]
    const operationEvent = {
      type: 'message-created',
      operationId: 'operation-1',
      session,
      topic: {
        id: 'topic-1',
        sessionId: 'session-1',
        title: '默认话题',
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:00:00.000Z'
      },
      thread: {
        id: 'thread-1',
        topicId: 'topic-1',
        title: '主线',
        type: 'standalone',
        status: 'active',
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:00:00.000Z'
      },
      message
    } as const

    operationEventListener(operationEvent)

    expect(emitSessionEvent).toHaveBeenCalledWith(
      RPC_CHANNELS.sessions.event,
      operationEvent,
      undefined
    )
  })

  it('broadcasts saved settings to open renderer windows', async () => {
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const settings = createDefaultAppSettings()
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }

    settingsService.saveAppearance.mockResolvedValue(settings)
    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(
      await dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: { id: 1 } },
        RPC_CHANNELS.settings.saveAppearance,
        [{ theme: 'dark' }]
      )
    ).toBe(settings)
    expect(firstWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.settings.onChange,
        args: [settings]
      })
    )
    expect(secondWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.settings.onChange,
        args: [settings]
      })
    )
  })

  it('registers project handlers and broadcasts project changes', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const project = {
      id: 'project-1',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const event = {
      activeProject: project,
      projects: [project]
    }
    const firstWebContents = { id: 1, send: vi.fn() }
    const secondWebContents = { id: 2, send: vi.fn() }

    projectsService.listProjects.mockResolvedValue([project])
    projectsService.getActiveProject.mockResolvedValue(project)
    projectsService.useExistingFolder.mockResolvedValue(project)
    projectsService.setActiveProject.mockResolvedValue(project)
    projectsService.deleteProject.mockResolvedValue(undefined)
    projectsService.createChangeEvent.mockResolvedValue(event)
    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(
      await dispatchRpcRequest(ipcChannels.rpc.request, { sender: { id: 1 } }, RPC_CHANNELS.projects.list)
    ).toEqual([project])
    expect(
      await dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: { id: 1 } },
        RPC_CHANNELS.projects.getActive
      )
    ).toBe(project)
    expect(
      await dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: { id: 1 } },
        RPC_CHANNELS.projects.useExistingFolder
      )
    ).toBe(project)
    expect(
      await dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: { id: 1 } },
        RPC_CHANNELS.projects.setActive,
        [{ projectId: 'project-1' }]
      )
    ).toBe(project)
    expect(
      await dispatchRpcRequest(
        ipcChannels.rpc.request,
        { sender: { id: 1 } },
        RPC_CHANNELS.projects.delete,
        [{ projectId: 'project-1' }]
      )
    ).toBeUndefined()

    expect(projectsService.setActiveProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(projectsService.deleteProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(firstWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.projects.onChange,
        args: [event]
      })
    )
    expect(secondWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.projects.onChange,
        args: [event]
      })
    )
  })

  it('registers window control handlers that operate on the sender window', async () => {
    const browserWindow = {
      close: vi.fn(),
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn()
    }

    fromWebContentsMock.mockReturnValue(browserWindow)

    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    const event = { sender: {} }

    await dispatchRpcRequest(ipcChannels.rpc.request, event, RPC_CHANNELS.window.close)
    await dispatchRpcRequest(ipcChannels.rpc.request, event, RPC_CHANNELS.window.minimize)
    await dispatchRpcRequest(ipcChannels.rpc.request, event, RPC_CHANNELS.window.toggleMaximize)

    expect(fromWebContentsMock).toHaveBeenCalledTimes(3)
    expect(browserWindow.close).toHaveBeenCalledTimes(1)
    expect(browserWindow.minimize).toHaveBeenCalledTimes(1)
    expect(browserWindow.maximize).toHaveBeenCalledTimes(1)
    expect(browserWindow.unmaximize).not.toHaveBeenCalled()
  })

  it('registers a handler that opens the dedicated settings window', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')

    registerIpcHandlers({
      chatService: chatService as never,
      projectsService: projectsService as never,
      settingsService: settingsService as never,
      openSettingsWindow
    })

    await dispatchRpcRequest(ipcChannels.rpc.request, { sender: {} }, RPC_CHANNELS.window.openSettings)
    await dispatchRpcRequest(
      ipcChannels.rpc.request,
      { sender: {} },
      RPC_CHANNELS.window.openSettings,
      [{ section: 'providers' }]
    )

    expect(openSettingsWindow).toHaveBeenCalledTimes(2)
    expect(openSettingsWindow).toHaveBeenCalledWith(undefined)
    expect(openSettingsWindow).toHaveBeenCalledWith({ section: 'providers' })
  })

  it('rejects unsupported settings-window sections before opening a window', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')

    registerIpcHandlers({
      chatService: chatService as never,
      projectsService: projectsService as never,
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const handler = getRegisteredHandler(ipcChannels.rpc.request)

    await expect(
      handler?.(
        { sender: {} },
        {
          id: 'request-1',
          type: 'request',
          channel: RPC_CHANNELS.window.openSettings,
          args: [{ section: 'general' }]
        }
      )
    ).resolves.toMatchObject({
      type: 'response',
      channel: RPC_CHANNELS.window.openSettings,
      error: {
        code: 'HANDLER_ERROR'
      }
    })
    expect(openSettingsWindow).not.toHaveBeenCalled()
  })

  it('registers a handler that reads the sender window state', async () => {
    const browserWindow = {
      isMaximized: vi.fn(() => true)
    }

    fromWebContentsMock.mockReturnValue(browserWindow)

    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')

    registerIpcHandlers({
      chatService: chatService as never,
      projectsService: projectsService as never,
      settingsService: settingsService as never,
      openSettingsWindow
    })

    await expect(
      dispatchRpcRequest(ipcChannels.rpc.request, { sender: {} }, RPC_CHANNELS.window.getState)
    ).resolves.toEqual({ isMaximized: true })
  })
})
