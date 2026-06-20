/**
 * 负责把 Electron preload-main 通信统一适配为 envelope RPC server/push port。
 * 本文件只承载 rpc:request/rpc:event 传输和本地窗口路由，不承载具体业务 handler。
 */

import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'

import { ipcChannels } from '@ipc/channels'
import type {
  RpcRequestHandler,
  RpcServerPort,
  SessionRpcRequestContext
} from '@moon/server-core/handlers'
import type { SessionEventRouteHint } from '@moon/server-core/sessions'
import {
  EnvelopePushPort,
  EnvelopeRpcServer,
  pushTyped,
  type RpcPushPort
} from '@moon/server-core/transport'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import {
  RPC_CHANNELS,
  type BroadcastEventArgs,
  type BroadcastEventChannel,
  type MessageEnvelope,
  type PushTarget
} from '@moon/shared/protocol'
import {
  findLegacyWebContentsClient,
  getLegacyWebContentsClientId,
  listLegacyWebContentsClients,
  listLegacyWebContentsClientsByWorkspace
} from './legacy-webcontents-client-registry'

/**
 * unified envelope RPC 每次请求可读取的 Electron main 上下文。
 */
export type ElectronEnvelopeRpcRequestContext = SessionRpcRequestContext & {
  event: IpcMainInvokeEvent
}

/**
 * Electron envelope event 当前支持的本地发送目标。
 */
export type ElectronEnvelopeRpcEventTarget =
  | PushTarget
  | { to: 'webContents'; sender: Pick<WebContents, 'send'> }

/**
 * 创建 Electron envelope RPC server/push port，供 session 和 app-shell handler 共用。
 */
export function createElectronEnvelopeIpcRpcServer(): RpcServerPort<ElectronEnvelopeRpcRequestContext> &
  RpcPushPort {
  const envelopeServer = new EnvelopeRpcServer<ElectronEnvelopeRpcRequestContext>()
  const envelopePushPort = new EnvelopePushPort({
    send: emitElectronEnvelopeRpcEventEnvelope
  })
  let isRequestHandlerRegistered = false

  const rpcServer: RpcServerPort<ElectronEnvelopeRpcRequestContext> & RpcPushPort = {
    handle: <TArgs extends readonly unknown[], TResult>(
      channel: string,
      handler: RpcRequestHandler<ElectronEnvelopeRpcRequestContext, TArgs, TResult>
    ) => {
      envelopeServer.handle(channel, handler)

      if (!isRequestHandlerRegistered) {
        isRequestHandlerRegistered = true
        ipcMain.handle(ipcChannels.rpc.request, (event, envelope: MessageEnvelope) => {
          return envelopeServer.dispatch(
            createElectronEnvelopeRequestContext(event, rpcServer),
            envelope
          )
        })
      }
    },
    push: (channel, target, ...args) => {
      envelopePushPort.push(channel, target, ...args)
    }
  }

  return rpcServer
}

/**
 * 通过 shared RPC event channel 发送本地 envelope IPC 事件。
 */
export function emitElectronEnvelopeRpcEvent<TChannel extends BroadcastEventChannel>(
  channel: TChannel,
  target: ElectronEnvelopeRpcEventTarget,
  ...args: BroadcastEventArgs<TChannel>
): void {
  emitElectronEnvelopeRpcEventEnvelope(target, createEventEnvelope(channel, target, args))
}

/**
 * 为单次 IPC 调用创建 request context，同时暴露 session runtime event 出口。
 */
function createElectronEnvelopeRequestContext(
  event: IpcMainInvokeEvent,
  rpcServer: RpcPushPort
): ElectronEnvelopeRpcRequestContext {
  const clientId = getLegacyWebContentsClientId(event.sender)

  return {
    event,
    emitSessionEvent: (eventChannel, operationEvent, routeHint) => {
      emitSessionEvent(rpcServer, eventChannel, operationEvent, clientId, routeHint)
    }
  }
}

/**
 * 把内部 `session:event` 按 workspace route hint 或当前 client 派发。
 */
function emitSessionEvent(
  rpcServer: RpcPushPort,
  eventChannel: typeof RPC_CHANNELS.sessions.event,
  operationEvent: ChatOperationEvent,
  clientId: string,
  routeHint?: SessionEventRouteHint
): void {
  if (eventChannel !== RPC_CHANNELS.sessions.event) {
    return
  }

  pushTyped(
    rpcServer,
    eventChannel,
    resolveSessionEventPushTarget(operationEvent, clientId, routeHint),
    operationEvent
  )
}

/**
 * 优先使用 server-core 内部 route hint 做 workspace 定向，再回落到事件 payload。
 * 两者都缺失时保持当前 client 范围。
 */
function resolveSessionEventPushTarget(
  operationEvent: ChatOperationEvent,
  fallbackClientId: string,
  routeHint?: SessionEventRouteHint
): PushTarget {
  if (routeHint?.workspaceId) {
    return { to: 'workspace', workspaceId: routeHint.workspaceId }
  }

  if ('session' in operationEvent && operationEvent.session.projectId !== null) {
    return { to: 'workspace', workspaceId: operationEvent.session.projectId }
  }

  return { to: 'client', clientId: fallbackClientId }
}

/**
 * 通过 event envelope 发送本地 Electron IPC 事件。
 */
function emitElectronEnvelopeRpcEventEnvelope(
  target: ElectronEnvelopeRpcEventTarget,
  envelope: MessageEnvelope
): void {
  if (envelope.type !== 'event') {
    throw new Error(`Unsupported Electron envelope RPC event type: ${envelope.type}`)
  }

  if (typeof envelope.channel !== 'string' || envelope.channel.length === 0) {
    throw new Error('Missing Electron envelope RPC event channel')
  }

  if (target.to === 'all') {
    sendToAllClients(envelope, target.exclude)
    return
  }

  if (target.to === 'client') {
    findLegacyWebContentsClient(target.clientId)?.webContents.send(ipcChannels.rpc.event, envelope)
    return
  }

  if (target.to === 'workspace') {
    sendToWorkspaceClients(envelope, target.workspaceId, target.exclude)
    return
  }

  target.sender.send(ipcChannels.rpc.event, envelope)
}

/**
 * 向全部本地 envelope client 推送 event envelope，可按 clientId 排除。
 */
function sendToAllClients(envelope: MessageEnvelope, exclude: string | undefined): void {
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

/**
 * 创建可通过 rpc:event 发送的 event envelope，并把路由线索投射到 envelope 字段。
 */
function createEventEnvelope(
  channel: string,
  target: ElectronEnvelopeRpcEventTarget,
  args: unknown[]
): MessageEnvelope {
  const envelope: MessageEnvelope = {
    id: randomUUID(),
    type: 'event',
    channel,
    args
  }

  if (target.to === 'client') {
    return {
      ...envelope,
      clientId: target.clientId
    }
  }

  if (target.to === 'workspace') {
    return {
      ...envelope,
      workspaceId: target.workspaceId
    }
  }

  return envelope
}
