/**
 * 负责注册 Electron app-shell 的 LOCAL_ONLY RPC handlers。
 * 本层只编排 settings/projects/window 本地能力，不依赖 renderer 或远程 transport。
 */

import { BrowserWindow } from 'electron'

import { openSettingsInputSchema } from '@ipc/window-contracts'
import type { RpcServerPort } from '@moon/server-core/handlers'
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
import type { DeleteProjectInput, SetActiveProjectInput } from '@moon/shared/domain/project-validation'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import type { ProjectsService } from '../services/projects-service'
import type { SettingsService } from '../services/settings-service'
import type { AppShellRpcRequestContext } from './app-shell-ipc-adapter'

type AppShellRpcServer = RpcServerPort<AppShellRpcRequestContext> & RpcPushPort

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
): Promise<void> {
  const event = await projectsService.createChangeEvent()

  pushTyped(server, RPC_CHANNELS.projects.onChange, { to: 'all' }, event)
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
  server.handle(RPC_CHANNELS.projects.getActive, () => projectsService.getActiveProject())
  server.handle(RPC_CHANNELS.projects.useExistingFolder, async () => {
    const project = await projectsService.useExistingFolder()

    await broadcastProjectsChange(server, projectsService)

    return project
  })
  server.handle(RPC_CHANNELS.projects.delete, async (_context, input: DeleteProjectInput) => {
    await projectsService.deleteProject(input)
    await broadcastProjectsChange(server, projectsService)
  })
  server.handle(RPC_CHANNELS.projects.setActive, async (_context, input: SetActiveProjectInput) => {
    const project = await projectsService.setActiveProject(input)

    await broadcastProjectsChange(server, projectsService)

    return project
  })
}

/**
 * 注册 window controls 相关 RPC handlers，操作当前 IPC 调用来源窗口。
 */
function registerWindowHandlers(
  server: RpcServerPort<AppShellRpcRequestContext>,
  openSettingsWindow: (input?: { section?: 'providers' }) => BrowserWindow
): void {
  server.handle(RPC_CHANNELS.window.close, (context) => {
    BrowserWindow.fromWebContents(context.event.sender)?.close()
  })
  server.handle(RPC_CHANNELS.window.minimize, (context) => {
    BrowserWindow.fromWebContents(context.event.sender)?.minimize()
  })
  server.handle(RPC_CHANNELS.window.toggleMaximize, (context) => {
    const senderWindow = BrowserWindow.fromWebContents(context.event.sender)

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
  server.handle(RPC_CHANNELS.window.getState, (context) => {
    const senderWindow = BrowserWindow.fromWebContents(context.event.sender)

    return {
      isMaximized: senderWindow?.isMaximized() ?? false
    }
  })
}
