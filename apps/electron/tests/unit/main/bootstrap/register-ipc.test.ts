// @vitest-environment node

/**
 * 验证 main 入口按 Craft 风格注册本机 WS RPC server。
 * IPC 在这里仅负责 preload 初始化 discovery，不再承载业务 RPC 分发。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RpcRequestHandler, SessionRpcRequestContext } from '@moon/server-core/handlers'

const removeHandlerMock = vi.fn()
const handleMock = vi.fn()
const getAllWindowsMock = vi.fn()
const openExternalMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock
  },
  shell: {
    openExternal: openExternalMock
  }
}))

function getIpcHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  return handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
}

function createWorkspaceRpcServerFixture() {
  const handlers = new Map<string, RpcRequestHandler<SessionRpcRequestContext>>()
  const close = vi.fn(async () => undefined)
  const getTransportInfo = vi.fn(async () => ({
    authToken: 'local-workspace-secret',
    mode: 'local' as const,
    url: 'ws://127.0.0.1:48123'
  }))
  const push = vi.fn()

  return {
    server: {
      close,
      findClientByWebContentsId: vi.fn(() => 'client-1'),
      findClientsWithCapability: vi.fn(() => []),
      getTransportInfo,
      handle: (channel: string, handler: RpcRequestHandler<SessionRpcRequestContext>) => {
        handlers.set(channel, handler)
      },
      hasClientCapability: vi.fn(() => false),
      invokeClient: vi.fn(),
      push,
      updateClientWorkspace: vi.fn()
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
    createCustomAcpProvider: vi.fn(),
    createCustomProvider: vi.fn(),
    deleteProvider: vi.fn(),
    fetchProviderModels: vi.fn(),
    getSettings: vi.fn(),
    saveAppearance: vi.fn(),
    saveProvider: vi.fn(),
    testProvider: vi.fn()
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
    removeHandlerMock.mockReset()
    handleMock.mockReset()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([])
    openExternalMock.mockReset()
    openExternalMock.mockResolvedValue(undefined)
    Object.values(chatService).forEach((mock) => mock.mockReset())
    Object.values(settingsService).forEach((mock) => mock.mockReset())
    Object.values(projectsService).forEach((mock) => mock.mockReset())
    openSettingsWindow.mockReset()
  })

  afterEach(() => {
    delete process.env.MOON_WORKSPACE_ID
    delete process.env.MOON_WORKSPACE_WS_URL
    delete process.env.MOON_WORKSPACE_WS_TOKEN
  })

  it('registers bootstrap discovery IPC handlers only', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { localWebSocketTransportInfoChannel, webContentsIdChannel } =
      await import('@ipc/workspace-transport-contract')
    const workspace = createWorkspaceRpcServerFixture()

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(removeHandlerMock).toHaveBeenCalledWith(localWebSocketTransportInfoChannel)
    expect(removeHandlerMock).toHaveBeenCalledWith(webContentsIdChannel)
    expect(handleMock.mock.calls.map(([channel]) => channel)).toEqual([
      localWebSocketTransportInfoChannel,
      webContentsIdChannel
    ])
  })

  it('returns local WS transport info and webContents id through discovery IPC', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { localWebSocketTransportInfoChannel, webContentsIdChannel } =
      await import('@ipc/workspace-transport-contract')
    const workspace = createWorkspaceRpcServerFixture()

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(getIpcHandler(localWebSocketTransportInfoChannel)?.()).resolves.toEqual({
      authToken: 'local-workspace-secret',
      mode: 'local',
      url: 'ws://127.0.0.1:48123'
    })
    expect(getIpcHandler(webContentsIdChannel)?.({ sender: { id: 101 } })).toBe(101)
    expect(workspace.getTransportInfo).toHaveBeenCalledOnce()
  })

  it('registers app-shell and sessions handlers on the local WS server', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const workspace = createWorkspaceRpcServerFixture()
    const settings = createDefaultAppSettings()
    const session = {
      id: 'session-1',
      projectId: null,
      provider: 'openai',
      title: '新聊天',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }

    settingsService.getSettings.mockResolvedValue(settings)
    chatService.listSessions.mockResolvedValue([session])

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(workspace.getHandler(RPC_CHANNELS.settings.get)?.({})).resolves.toBe(settings)
    await expect(workspace.getHandler(RPC_CHANNELS.sessions.listSessions)?.({})).resolves.toEqual([
      session
    ])
  })

  it('broadcasts settings changes through the WS server push port', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const workspace = createWorkspaceRpcServerFixture()
    const settings = createDefaultAppSettings()

    settingsService.saveAppearance.mockResolvedValue(settings)

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(
      workspace.getHandler(RPC_CHANNELS.settings.saveAppearance)?.({}, { theme: 'dark' })
    ).resolves.toBe(settings)
    expect(workspace.push).toHaveBeenCalledWith(
      RPC_CHANNELS.settings.onChange,
      { to: 'all' },
      settings
    )
  })

  it('updates the calling WS client workspace when project selection changes', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const workspace = createWorkspaceRpcServerFixture()
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
    const setClientWorkspace = vi.fn()

    projectsService.setActiveProject.mockResolvedValue(project)
    projectsService.createChangeEvent.mockResolvedValue(event)

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(
      workspace.getHandler(RPC_CHANNELS.projects.setActive)?.(
        { clientId: 'client-1', setClientWorkspace },
        { projectId: 'project-1' }
      )
    ).resolves.toBe(project)
    expect(setClientWorkspace).toHaveBeenCalledWith('project-1')
  })

  it('operates on the sender window through WS request context webContentsId', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const workspace = createWorkspaceRpcServerFixture()
    const browserWindow = {
      close: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      minimize: vi.fn(),
      unmaximize: vi.fn(),
      webContents: { id: 777 }
    }

    getAllWindowsMock.mockReturnValue([browserWindow])

    registerIpcHandlers({
      chatService: chatService as never,
      createWorkspaceRpcServer: () => workspace.server as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await workspace.getHandler(RPC_CHANNELS.window.close)?.({ webContentsId: 777 })
    await workspace.getHandler(RPC_CHANNELS.window.minimize)?.({ webContentsId: 777 })
    await workspace.getHandler(RPC_CHANNELS.window.toggleMaximize)?.({ webContentsId: 777 })

    expect(browserWindow.close).toHaveBeenCalledOnce()
    expect(browserWindow.minimize).toHaveBeenCalledOnce()
    expect(browserWindow.maximize).toHaveBeenCalledOnce()
  })

  it('returns cleanup that closes the local WS server', async () => {
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
})
