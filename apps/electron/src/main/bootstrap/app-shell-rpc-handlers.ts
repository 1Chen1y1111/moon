/**
 * 负责注册 Electron app-shell 的 LOCAL_ONLY RPC handlers。
 * 本层只编排 settings/projects/window 本地能力，入口遵循 Craft 风格 WS request context。
 */

import { BrowserWindow, shell } from 'electron'

import { openExternalInputSchema, openSettingsInputSchema } from '@ipc/window-contracts'
import type { RpcServerPort, SessionRpcRequestContext } from '@moon/server-core/handlers'
import { pushTyped, type RpcPushPort } from '@moon/server-core/transport'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@moon/shared/domain/settings-validation'
import type { AppSettings } from '@moon/shared/domain/settings'
import type { ProjectRecord } from '@moon/shared/domain/project'
import type {
  DeleteProjectInput,
  SetActiveProjectInput
} from '@moon/shared/domain/project-validation'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import type { ProjectsService } from '../services/projects-service'
import type { SettingsService } from '../services/settings-service'

type AppShellRpcServer = RpcServerPort<SessionRpcRequestContext> & RpcPushPort

/**
 * 注册 app-shell RPC handlers 所需的 Electron main 依赖。
 */
export type RegisterAppShellHandlersDependencies = {
  settingsService: SettingsService
  projectsService: ProjectsService
  openSettingsWindow: (input?: { section?: 'providers' }) => BrowserWindow
}

/**
 * 注册 settings/projects/window 的 LOCAL_ONLY RPC handlers。
 */
export function registerAppShellHandlers(
  server: AppShellRpcServer,
  { openSettingsWindow, projectsService, settingsService }: RegisterAppShellHandlersDependencies
): void {
  registerSettingsHandlers(server, settingsService)
  registerProjectsHandlers(server, projectsService)
  registerWindowHandlers(server, openSettingsWindow)
}

/**
 * 向所有已打开窗口广播最新设置快照。
 */
function broadcastSettingsChange(server: RpcPushPort, settings: AppSettings): void {
  pushTyped(server, RPC_CHANNELS.settings.onChange, { to: 'all' }, settings)
}

/**
 * 生成项目快照并广播给所有 renderer 窗口。
 */
async function broadcastProjectsChange(
  server: RpcPushPort,
  projectsService: ProjectsService
): Promise<{ activeProject: ProjectRecord | null }> {
  const event = await projectsService.createChangeEvent()

  pushTyped(server, RPC_CHANNELS.projects.onChange, { to: 'all' }, event)

  return event
}

/**
 * 将当前 WS client 绑定到对应 workspace；null 表示普通未绑定聊天空间。
 */
function bindSenderWorkspace(
  context: SessionRpcRequestContext,
  project: Pick<ProjectRecord, 'id'> | null
): void {
  context.setClientWorkspace?.(project?.id ?? null)
}

/**
 * 按 Craft 风格 request context 的 webContentsId 找到当前 Electron 窗口。
 */
function getSenderWindow(context: SessionRpcRequestContext): BrowserWindow | null {
  if (typeof context.webContentsId !== 'number') {
    return null
  }

  return (
    BrowserWindow.getAllWindows().find(
      (window) => window.webContents.id === context.webContentsId
    ) ?? null
  )
}

/**
 * 注册 settings 相关 RPC handlers，并在变更后广播旧设置事件。
 */
function registerSettingsHandlers(
  server: AppShellRpcServer,
  settingsService: SettingsService
): void {
  server.handle(RPC_CHANNELS.settings.get, () => settingsService.getSettings())
  server.handle(
    RPC_CHANNELS.settings.createCustomProvider,
    async (_context, input: CreateCustomProviderInput) => {
      const settings = await settingsService.createCustomProvider(input)

      broadcastSettingsChange(server, settings)

      return settings
    }
  )
  server.handle(
    RPC_CHANNELS.settings.createCustomAcpProvider,
    async (_context, input: CreateCustomAcpProviderInput) => {
      const settings = await settingsService.createCustomAcpProvider(input)

      broadcastSettingsChange(server, settings)

      return settings
    }
  )
  server.handle(RPC_CHANNELS.settings.saveProvider, async (_context, input: SaveProviderInput) => {
    const settings = await settingsService.saveProvider(input)

    broadcastSettingsChange(server, settings)

    return settings
  })
  server.handle(
    RPC_CHANNELS.settings.deleteProvider,
    async (_context, input: DeleteProviderInput) => {
      const settings = await settingsService.deleteProvider(input)

      broadcastSettingsChange(server, settings)

      return settings
    }
  )
  server.handle(
    RPC_CHANNELS.settings.fetchProviderModels,
    async (_context, input: ProviderConnectionInput) => {
      const settings = await settingsService.fetchProviderModels(input)

      broadcastSettingsChange(server, settings)

      return settings
    }
  )
  server.handle(RPC_CHANNELS.settings.testProvider, (_context, input: ProviderConnectionInput) =>
    settingsService.testProvider(input)
  )
  server.handle(
    RPC_CHANNELS.settings.saveAppearance,
    async (_context, input: SaveAppearanceInput) => {
      const settings = await settingsService.saveAppearance(input)

      broadcastSettingsChange(server, settings)

      return settings
    }
  )
}

/**
 * 注册 projects 相关 RPC handlers，并在项目集合变化后广播旧项目事件。
 */
function registerProjectsHandlers(
  server: AppShellRpcServer,
  projectsService: ProjectsService
): void {
  server.handle(RPC_CHANNELS.projects.list, () => projectsService.listProjects())
  server.handle(RPC_CHANNELS.projects.getActive, async (context) => {
    const project = await projectsService.getActiveProject()

    bindSenderWorkspace(context, project)

    return project
  })
  server.handle(RPC_CHANNELS.projects.useExistingFolder, async (context) => {
    const project = await projectsService.useExistingFolder()

    await broadcastProjectsChange(server, projectsService)

    if (project !== null) {
      bindSenderWorkspace(context, project)
    }

    return project
  })
  server.handle(RPC_CHANNELS.projects.delete, async (context, input: DeleteProjectInput) => {
    await projectsService.deleteProject(input)
    const event = await broadcastProjectsChange(server, projectsService)

    bindSenderWorkspace(context, event.activeProject)
  })
  server.handle(RPC_CHANNELS.projects.setActive, async (context, input: SetActiveProjectInput) => {
    const project = await projectsService.setActiveProject(input)

    await broadcastProjectsChange(server, projectsService)
    bindSenderWorkspace(context, project)

    return project
  })
}

/**
 * 注册 window controls 相关 RPC handlers，操作当前 IPC 调用来源窗口。
 */
function registerWindowHandlers(
  server: RpcServerPort<SessionRpcRequestContext>,
  openSettingsWindow: (input?: { section?: 'providers' }) => BrowserWindow
): void {
  server.handle(RPC_CHANNELS.window.close, (context) => {
    getSenderWindow(context)?.close()
  })
  server.handle(RPC_CHANNELS.window.minimize, (context) => {
    getSenderWindow(context)?.minimize()
  })
  server.handle(RPC_CHANNELS.window.toggleMaximize, (context) => {
    const senderWindow = getSenderWindow(context)

    if (senderWindow === null) {
      return
    }

    if (senderWindow.isMaximized()) {
      senderWindow.unmaximize()
      return
    }

    senderWindow.maximize()
  })
  server.handle(RPC_CHANNELS.window.openSettings, (_context, input: unknown) => {
    openSettingsWindow(openSettingsInputSchema.parse(input))
  })
  server.handle(RPC_CHANNELS.window.openExternal, async (_context, input: unknown) => {
    const { url } = openExternalInputSchema.parse(input)

    await shell.openExternal(normalizeExternalCapabilityUrl(url))
  })
  server.handle(RPC_CHANNELS.window.getState, (context) => {
    const senderWindow = getSenderWindow(context)

    return {
      isMaximized: senderWindow?.isMaximized() ?? false
    }
  })
}

/**
 * 将 capability 传入的 URL 规整为 shell 可打开的外链，禁止本地文件和脚本协议。
 */
function normalizeExternalCapabilityUrl(url: string): string {
  const parsedUrl = parseExternalCapabilityUrl(url)

  if (parsedUrl === null || !isAllowedExternalCapabilityProtocol(parsedUrl.protocol)) {
    throw new Error('Unsupported external URL protocol')
  }

  return parsedUrl.href
}

/**
 * 解析 capability 外链 URL，失败时返回 null 交给调用方统一报错。
 */
function parseExternalCapabilityUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * 限制 server-to-client 外链能力只覆盖普通网页协议。
 */
function isAllowedExternalCapabilityProtocol(protocol: string): boolean {
  return protocol === 'https:' || protocol === 'http:'
}
