// @vitest-environment node

/**
 * 负责验证 app-shell RPC handlers 的 service 委托、事件广播和窗口控制行为。
 * 测试直接使用 fake RPC server，不触发真实 Electron IPC。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RpcRequestHandler, RpcServerPort } from '@moon/server-core/handlers'
import type { RpcPushPort } from '@moon/server-core/transport'
import type { ElectronEnvelopeRpcRequestContext } from '@main/bootstrap/electron-envelope-ipc-rpc-server'

const fromWebContentsMock = vi.fn()
const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
    getAllWindows: getAllWindowsMock
  }
}))

function createRpcServerFixture(): {
  server: RpcServerPort<ElectronEnvelopeRpcRequestContext> & RpcPushPort
  getHandler: (
    channel: string
  ) => RpcRequestHandler<ElectronEnvelopeRpcRequestContext> | undefined
  push: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<string, RpcRequestHandler<ElectronEnvelopeRpcRequestContext>>()
  const push = vi.fn()

  return {
    server: {
      handle: (channel, handler) => {
        handlers.set(channel, handler as RpcRequestHandler<ElectronEnvelopeRpcRequestContext>)
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

    await expect(getHandler(RPC_CHANNELS.settings.get)?.({ event: { sender: {} } as never })).resolves.toBe(
      settings
    )
    await expect(
      getHandler(RPC_CHANNELS.settings.saveProvider)?.(
        { event: { sender: {} } as never },
        providerInput
      )
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.createCustomProvider)?.(
        { event: { sender: {} } as never },
        { name: 'Custom OpenAI' }
      )
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.createCustomAcpProvider)?.(
        { event: { sender: {} } as never },
        { name: 'Custom ACP' }
      )
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.deleteProvider)?.(
        { event: { sender: {} } as never },
        { provider: 'custom-openai' }
      )
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.fetchProviderModels)?.(
        { event: { sender: {} } as never },
        providerInput
      )
    ).resolves.toBe(settings)
    await expect(
      getHandler(RPC_CHANNELS.settings.testProvider)?.(
        { event: { sender: {} } as never },
        providerInput
      )
    ).resolves.toEqual({ ok: true })
    await expect(
      getHandler(RPC_CHANNELS.settings.saveAppearance)?.(
        { event: { sender: {} } as never },
        { theme: 'dark' }
      )
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
    const { findLegacyWebContentsClient } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
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
    const sender = { id: 501, send: vi.fn() }
    const context = { event: { sender } as never }

    projectsService.listProjects.mockResolvedValue([project])
    projectsService.getActiveProject.mockResolvedValue(project)
    projectsService.useExistingFolder.mockResolvedValue(project)
    projectsService.setActiveProject.mockResolvedValue(project)
    projectsService.deleteProject.mockResolvedValue(undefined)
    projectsService.createChangeEvent.mockResolvedValue(event)
    getAllWindowsMock.mockReturnValue([{ webContents: sender }])

    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(getHandler(RPC_CHANNELS.projects.list)?.(context)).resolves.toEqual([project])
    await expect(getHandler(RPC_CHANNELS.projects.getActive)?.(context)).resolves.toBe(project)
    expect(findLegacyWebContentsClient('501')?.workspaceId).toBe('project-1')
    await expect(
      getHandler(RPC_CHANNELS.projects.useExistingFolder)?.(context)
    ).resolves.toBe(project)
    expect(findLegacyWebContentsClient('501')?.workspaceId).toBe('project-1')
    await expect(
      getHandler(RPC_CHANNELS.projects.setActive)?.(
        context,
        { projectId: 'project-1' }
      )
    ).resolves.toBe(project)
    expect(findLegacyWebContentsClient('501')?.workspaceId).toBe('project-1')
    await expect(
      getHandler(RPC_CHANNELS.projects.delete)?.(
        context,
        { projectId: 'project-1' }
      )
    ).resolves.toBeUndefined()
    expect(findLegacyWebContentsClient('501')?.workspaceId).toBe('project-1')

    expect(projectsService.setActiveProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(projectsService.deleteProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(push).toHaveBeenCalledTimes(3)
    expect(push).toHaveBeenCalledWith(RPC_CHANNELS.projects.onChange, { to: 'all' }, event)
  })

  it('syncs a null active project as an unbound sender workspace', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
    const { findLegacyWebContentsClient } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const { server, getHandler } = createRpcServerFixture()
    const sender = { id: 502, send: vi.fn() }
    const context = { event: { sender } as never }

    projectsService.getActiveProject.mockResolvedValue(null)
    projectsService.setActiveProject.mockResolvedValue(null)
    projectsService.createChangeEvent.mockResolvedValue({
      activeProject: null,
      projects: []
    })
    getAllWindowsMock.mockReturnValue([{ webContents: sender }])

    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await expect(getHandler(RPC_CHANNELS.projects.getActive)?.(context)).resolves.toBeNull()
    expect(findLegacyWebContentsClient('502')?.workspaceId).toBeNull()

    await expect(
      getHandler(RPC_CHANNELS.projects.setActive)?.(context, { projectId: null })
    ).resolves.toBeNull()
    expect(findLegacyWebContentsClient('502')?.workspaceId).toBeNull()
  })

  it('keeps window control behavior on the sender window', async () => {
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { registerAppShellHandlers } = await import('@main/bootstrap/app-shell-rpc-handlers')
    const browserWindow = {
      close: vi.fn(),
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn()
    }
    const sender = {}
    const { server, getHandler } = createRpcServerFixture()

    fromWebContentsMock.mockReturnValue(browserWindow)

    registerAppShellHandlers(server, {
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    await getHandler(RPC_CHANNELS.window.close)?.({ event: { sender } as never })
    await getHandler(RPC_CHANNELS.window.minimize)?.({ event: { sender } as never })
    await getHandler(RPC_CHANNELS.window.toggleMaximize)?.({ event: { sender } as never })
    expect(getHandler(RPC_CHANNELS.window.getState)?.({ event: { sender } as never })).toEqual({
      isMaximized: false
    })
    await getHandler(RPC_CHANNELS.window.openSettings)?.(
      { event: { sender } as never },
      { section: 'providers' }
    )

    expect(fromWebContentsMock).toHaveBeenCalledWith(sender)
    expect(browserWindow.close).toHaveBeenCalledTimes(1)
    expect(browserWindow.minimize).toHaveBeenCalledTimes(1)
    expect(browserWindow.maximize).toHaveBeenCalledTimes(1)
    expect(browserWindow.unmaximize).not.toHaveBeenCalled()
    expect(openSettingsWindow).toHaveBeenCalledWith({ section: 'providers' })
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
      getHandler(RPC_CHANNELS.window.openSettings)?.(
        { event: { sender: {} } as never },
        { section: 'general' }
      )
    ).toThrow()
    expect(openSettingsWindow).not.toHaveBeenCalled()
  })
})
