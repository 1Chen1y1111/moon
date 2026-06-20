/**
 * 负责把 Electron 内部 workspace RPC 通道适配为 envelope RPC server/push port。
 * 本文件只承载 rpc:request/rpc:event 传输语义，不承载具体 session 业务 handler。
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type { RpcRequestHandler, RpcServerPort } from '@moon/server-core/handlers'
import { EnvelopePushPort, EnvelopeRpcServer, type RpcPushPort } from '@moon/server-core/transport'
import type { MessageEnvelope, PushTarget } from '@moon/shared/protocol'
import {
  findLegacyWebContentsClient,
  listLegacyWebContentsClients,
  listLegacyWebContentsClientsByWorkspace
} from './legacy-webcontents-client-registry'

/**
 * 创建 workspace envelope IPC server 时需要的请求上下文工厂。
 */
export type WorkspaceEnvelopeIpcRpcServerOptions<TContext> = {
  createContext: (event: IpcMainInvokeEvent) => TContext
}

/**
 * 创建 workspace envelope IPC 版 RPC server/push port。
 */
export function createWorkspaceEnvelopeIpcRpcServer<TContext>({
  createContext
}: WorkspaceEnvelopeIpcRpcServerOptions<TContext>): RpcServerPort<TContext> & RpcPushPort {
  const envelopeServer = new EnvelopeRpcServer<TContext>()
  const envelopePushPort = new EnvelopePushPort({
    send: emitWorkspaceEnvelopeIpcEvent
  })
  let isRequestHandlerRegistered = false

  return {
    handle: <TArgs extends readonly unknown[], TResult>(
      channel: string,
      handler: RpcRequestHandler<TContext, TArgs, TResult>
    ) => {
      envelopeServer.handle(channel, handler)

      if (!isRequestHandlerRegistered) {
        isRequestHandlerRegistered = true
        ipcMain.handle(ipcChannels.rpc.request, (event, envelope: MessageEnvelope) => {
          return envelopeServer.dispatch(createContext(event), envelope)
        })
      }
    },
    push: (channel, target, ...args) => {
      envelopePushPort.push(channel, target, ...args)
    }
  }
}

/**
 * 按 PushTarget 把 event envelope 发送到对应 Electron renderer 窗口。
 */
function emitWorkspaceEnvelopeIpcEvent(target: PushTarget, envelope: MessageEnvelope): void {
  if (target.to === 'all') {
    sendToAllWorkspaceClients(envelope, target.exclude)
    return
  }

  if (target.to === 'client') {
    findLegacyWebContentsClient(target.clientId)?.webContents.send(ipcChannels.rpc.event, envelope)
    return
  }

  sendToWorkspaceClients(envelope, target.workspaceId, target.exclude)
}

/**
 * 向全部本地 workspace client 推送 event envelope，可按 clientId 排除。
 */
function sendToAllWorkspaceClients(envelope: MessageEnvelope, exclude: string | undefined): void {
  listLegacyWebContentsClients().forEach((client) => {
    if (exclude !== undefined && client.clientId === exclude) {
      return
    }

    client.webContents.send(ipcChannels.rpc.event, envelope)
  })
}

/**
 * 向绑定到指定 workspace 的本地 client 推送 event envelope。
 */
function sendToWorkspaceClients(
  envelope: MessageEnvelope,
  workspaceId: string,
  exclude: string | undefined
): void {
  listLegacyWebContentsClientsByWorkspace(workspaceId).forEach((client) => {
    if (exclude !== undefined && client.clientId === exclude) {
      return
    }

    client.webContents.send(ipcChannels.rpc.event, envelope)
  })
}
