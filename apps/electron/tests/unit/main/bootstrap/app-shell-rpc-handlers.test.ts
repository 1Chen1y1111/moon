// @vitest-environment node

/**
 * 负责验证 app-shell RPC handlers 的 service 委托、事件广播和窗口控制行为。
 * 测试直接使用 fake RPC server，不触发真实 Electron IPC。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  RpcRequestHandler,
  RpcServerPort,
  SessionRpcRequestContext
} from '@moon/server-core/handlers'
import type { RpcPushPort } from '@moon/server-core/transport'

const fromWebContentsMock = vi.fn()
const getAllWindowsMock = vi.fn()
const openExternalMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
    getAllWindows: getAllWindowsMock
  },
  shell: {
    openExternal: openExternalMock
  }
}))

function createRpcServerFixture(): {
  server: RpcServerPort<SessionRpcRequestContext> & RpcPushPort
  getHandler: (channel: string) => RpcRequestHandler<SessionRpcRequestContext> | undefined
  push: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<string, RpcRequestHandler<SessionRpcRequestContext>>()
  const push = vi.fn()

  return {
    server: {
      handle: (channel, handler) => {
        handlers.set(channel, handler as RpcRequestHandler<SessionRpcRequestContext>)
      },
      push
    },
    getHandler: (channel) => handlers.get(channel),
    push
  }
}

describe('registerAppShellHandlers', () => {
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
    fromWebContentsMock.mockReset()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([])
    openExternalMock.mockReset()
    openExternalMock.mockResolvedValue(undefined)
    openSettingsWindow.mockReset()
    Object.values(settingsService).forEach((mock) => mock.mockReset())
    Object.values(projectsService).forEach((mock) => mock.mockReset())
  })

  it('delegates settings handlers and broadcasts settings changes', async () => {
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
    const settings = createDefaultAppSettings()
    const { server, getHandler, push } = createRpcServerFixture()

    settingsService.getSettings.mockResolvedValue(settings)
    settingsService.createCustomProvider.mockResolvedValue(settings)
    settingsService.createCustomAcpProvider.mockResolvedValue(settings)
    settingsService.saveProvider.mockResolvedValue(settings)
    settingsService.deleteProvider.mockResolvedValue(settings)
    settingsService.fetchProviderModels.mockResolvedValue(settings)
    settingsService.testProvider.mockResolvedValue({ ok: true })
    settingsService.saveAppearance.mockResolvedValue(settings)

    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    const providerInput = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    }

    await expect(getHandler(RPC_CHANNELS.settings.get)?.({})).resolves.toBe(settings)
    await expect(getHandler(RPC_CHANNELS.settings.saveProvider)?.({}, providerInput)).resolves.toBe(
      settings
    )
    await expect(
      getHandler(RPC_CHANNELS.settings.createCustomProvider)?.({}, { name: 'Custom OpenAI' })
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.createCustomAcpProvider)?.({}, { name: 'Custom ACP' })
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.deleteProvider)?.({}, { provider: 'custom-openai' })
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.fetchProviderModels)?.({}, providerInput)
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.testProvider)?.({}, providerInput)
    ).resolves.toEqual({ ok: true })
    await expect(
      getHandler(RPC_CHANNELS.settings.saveAppearance)?.({}, { theme: 'dark' })
    ).resolves.toBe(settings)

    expect(settingsService.saveProvider).toHaveBeenCalledWith(providerInput)
    expect(settingsService.createCustomProvider).toHaveBeenCalledWith({ name: 'Custom OpenAI' })
    expect(settingsService.createCustomAcpProvider).toHaveBeenCalledWith({ name: 'Custom ACP' })
    expect(settingsService.deleteProvider).toHaveBeenCalledWith({ provider: 'custom-openai' })
    expect(settingsService.fetchProviderModels).toHaveBeenCalledWith(providerInput)
    expect(settingsService.testProvider).toHaveBeenCalledWith(providerInput)
    expect(settingsService.saveAppearance).toHaveBeenCalledWith({ theme: 'dark' })
    expect(push).toHaveBeenCalledTimes(6)
    expect(push).toHaveBeenCalledWith(RPC_CHANNELS.settings.onChange, { to: 'all' }, settings)
  })

  it('delegates project handlers and broadcasts project changes', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
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
    const { server, getHandler, push } = createRpcServerFixture()
    const setClientWorkspace = vi.fn()
    const context = { setClientWorkspace }

    projectsService.listProjects.mockResolvedValue([project])
    projectsService.getActiveProject.mockResolvedValue(project)
    projectsService.useExistingFolder.mockResolvedValue(project)
    projectsService.setActiveProject.mockResolvedValue(project)
    projectsService.deleteProject.mockResolvedValue(undefined)
    projectsService.createChangeEvent.mockResolvedValue(event)
    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(getHandler(RPC_CHANNELS.projects.list)?.(context)).resolves.toEqual([project])
    await expect(getHandler(RPC_CHANNELS.projects.getActive)?.(context)).resolves.toBe(project)
    expect(setClientWorkspace).toHaveBeenLastCalledWith('project-1')
    await expect(getHandler(RPC_CHANNELS.projects.useExistingFolder)?.(context)).resolves.toBe(
      project
    )
    expect(setClientWorkspace).toHaveBeenLastCalledWith('project-1')
    await expect(
      getHandler(RPC_CHANNELS.projects.setActive)?.(context, { projectId: 'project-1' })
    ).resolves.toBe(project)
    expect(setClientWorkspace).toHaveBeenLastCalledWith('project-1')
    await expect(
      getHandler(RPC_CHANNELS.projects.delete)?.(context, { projectId: 'project-1' })
    ).resolves.toBeUndefined()
    expect(setClientWorkspace).toHaveBeenLastCalledWith('project-1')

    expect(projectsService.setActiveProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(projectsService.deleteProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(push).toHaveBeenCalledTimes(3)
    expect(push).toHaveBeenCalledWith(RPC_CHANNELS.projects.onChange, { to: 'all' }, event)
  })

  it('syncs a null active project as an unbound sender workspace', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
    const { server, getHandler } = createRpcServerFixture()
    const setClientWorkspace = vi.fn()
    const context = { setClientWorkspace }

    projectsService.getActiveProject.mockResolvedValue(null)
    projectsService.setActiveProject.mockResolvedValue(null)
    projectsService.createChangeEvent.mockResolvedValue({
      activeProject: null,
      projects: []
    })
    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(getHandler(RPC_CHANNELS.projects.getActive)?.(context)).resolves.toBeNull()
    expect(setClientWorkspace).toHaveBeenLastCalledWith(null)

    await expect(
      getHandler(RPC_CHANNELS.projects.setActive)?.(context, { projectId: null })
    ).resolves.toBeNull()
    expect(setClientWorkspace).toHaveBeenLastCalledWith(null)
  })

  it('keeps window control behavior on the sender window', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
    const browserWindow = {
      close: vi.fn(),
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      webContents: { id: 777 }
    }
    const context = { webContentsId: 777 }
    const { server, getHandler } = createRpcServerFixture()

    getAllWindowsMock.mockReturnValue([browserWindow])

    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await getHandler(RPC_CHANNELS.window.close)?.(context)
    await getHandler(RPC_CHANNELS.window.minimize)?.(context)
    await getHandler(RPC_CHANNELS.window.toggleMaximize)?.(context)
    expect(getHandler(RPC_CHANNELS.window.getState)?.(context)).toEqual({
      isMaximized: false
    })
    await getHandler(RPC_CHANNELS.window.openSettings)?.(context, { section: 'providers' })
    await getHandler(RPC_CHANNELS.window.openExternal)?.(context, {
      url: 'https://moon.local/auth'
    })

    expect(fromWebContentsMock).not.toHaveBeenCalled()
    expect(browserWindow.close).toHaveBeenCalledTimes(1)
    expect(browserWindow.minimize).toHaveBeenCalledTimes(1)
    expect(browserWindow.maximize).toHaveBeenCalledTimes(1)
    expect(browserWindow.unmaximize).not.toHaveBeenCalled()
    expect(openSettingsWindow).toHaveBeenCalledWith({ section: 'providers' })
    expect(openExternalMock).toHaveBeenCalledWith('https://moon.local/auth')
  })

  it('rejects unsupported settings-window sections before opening a window', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
    const { server, getHandler } = createRpcServerFixture()

    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(() =>
      getHandler(RPC_CHANNELS.window.openSettings)?.({}, { section: 'general' })
    ).toThrow()
    expect(openSettingsWindow).not.toHaveBeenCalled()
  })

  it('rejects unsupported external URLs before calling shell.openExternal', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
    const { server, getHandler } = createRpcServerFixture()

    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(
      getHandler(RPC_CHANNELS.window.openExternal)?.({}, { url: 'file:///tmp/secret.txt' })
    ).rejects.toThrow('Unsupported external URL protocol')
    expect(openExternalMock).not.toHaveBeenCalled()
  })
})
