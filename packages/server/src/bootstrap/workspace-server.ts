/**
 * 负责启动可独立运行的 Moon workspace WebSocket server。
 * 本层只注册 session RPC，不承载 Electron LOCAL_ONLY app-shell 能力。
 */

import { randomUUID } from 'node:crypto'

import { registerSessionHandlers } from '@moon/server-core/handlers/rpc'
import {
  createWorkspaceWebSocketRpcServer,
  type CreateWorkspaceSocketServer,
  type WorkspaceSocketServer,
  type WorkspaceSocketServerOptions,
  type WorkspaceWebSocketRpcServer
} from '@moon/server-core/transport'

import {
  createMoonServerRuntime,
  type CreateMoonServerRuntimeOptions,
  type MoonServerRuntime
} from './runtime'

export type StartMoonWorkspaceServerOptions = CreateMoonServerRuntimeOptions & {
  createClientId?: () => string
  createWebSocketServer?: CreateWorkspaceSocketServer
  host?: string
  port?: number
}

export type MoonWorkspaceServer = {
  close: () => Promise<void>
  runtime: MoonServerRuntime
  url: string
  workspaceRpcServer: WorkspaceWebSocketRpcServer
}

/**
 * 创建本地 runtime、注册 session handlers，并启动 workspace WebSocket endpoint。
 */
export async function startMoonWorkspaceServer({
  createClientId = randomUUID,
  createWebSocketServer = createDefaultWebSocketServer,
  host,
  port,
  ...runtimeOptions
}: StartMoonWorkspaceServerOptions): Promise<MoonWorkspaceServer> {
  const runtime = await createMoonServerRuntime(runtimeOptions)
  const workspaceRpcServer = createWorkspaceWebSocketRpcServer({
    createClientId,
    createWebSocketServer,
    host,
    port
  })

  registerSessionHandlers(workspaceRpcServer, { sessionHandlers: runtime.chatService })

  try {
    const url = await workspaceRpcServer.getTransportUrl()

    return {
      close: async () => {
        await workspaceRpcServer.close()
        await runtime.close()
      },
      runtime,
      url,
      workspaceRpcServer
    }
  } catch (error) {
    await workspaceRpcServer.close().catch(() => undefined)
    await runtime.close().catch(() => undefined)
    throw error
  }
}

/**
 * 使用运行时 `ws` 依赖创建 WebSocket server；依赖缺失时给出明确错误。
 */
async function createDefaultWebSocketServer(
  options: WorkspaceSocketServerOptions
): Promise<WorkspaceSocketServer> {
  const moduleName = 'ws'

  try {
    const wsModule = (await import(moduleName)) as {
      WebSocketServer: new (options: WorkspaceSocketServerOptions) => WorkspaceSocketServer
    }

    return new wsModule.WebSocketServer(options)
  } catch (error) {
    throw new Error(`Failed to load workspace WebSocket dependency "ws": ${getErrorMessage(error)}`)
  }
}

/**
 * 从未知错误中提取可读消息。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
