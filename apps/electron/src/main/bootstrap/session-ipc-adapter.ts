/**
 * 负责把 server-core sessions RPC 注册口适配到 Electron IPC。
 * 本文件只保留 sessions 专属 channel map 和 `session:event` bridge。
 */

import type { IpcMainInvokeEvent } from 'electron'

import type { RpcServerPort, SessionRpcRequestContext } from '@moon/server-core/handlers'
import type { SessionEventRouteHint } from '@moon/server-core/sessions'
import { pushTyped, type RpcPushPort } from '@moon/server-core/transport'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import { RPC_CHANNELS, type PushTarget } from '@moon/shared/protocol'
import { getLegacyWebContentsClientId } from './legacy-webcontents-client-registry'
import { createWorkspaceEnvelopeIpcRpcServer } from './workspace-envelope-ipc-rpc-server'

/**
 * 创建 Electron IPC 版 sessions RPC server port，供 server-core 注册器写入 handler。
 */
export function createSessionIpcRpcServer(): RpcServerPort<SessionRpcRequestContext> &
  RpcPushPort {
  let rpcServer!: RpcServerPort<SessionRpcRequestContext> & RpcPushPort

  rpcServer = createWorkspaceEnvelopeIpcRpcServer<SessionRpcRequestContext>({
    createContext: (event) => createSessionIpcRequestContext(event, rpcServer)
  })

  return rpcServer
}

/**
 * 为单次 IPC 调用创建 request context，内部 `session:event` 会回到当前调用窗口。
 */
function createSessionIpcRequestContext(
  event: IpcMainInvokeEvent,
  rpcServer: RpcPushPort
): SessionRpcRequestContext {
  const clientId = getLegacyWebContentsClientId(event.sender)

  return {
    emitSessionEvent: (eventChannel, operationEvent, routeHint) => {
      emitSessionEvent(rpcServer, eventChannel, operationEvent, clientId, routeHint)
    }
  }
}

/**
 * 把内部 `session:event` 按事件自身携带的 workspace 线索发送到目标窗口。
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
