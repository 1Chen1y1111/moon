/**
 * 负责 agent backend 权限审批运行态编排。
 * 它只处理 permission_request 事件入队、用户决策回传和 session grant 写入。
 */

import type { AgentPermissionRequest } from '@moon/core/types'

import {
  addPermissionGrantFromRequest,
  type AgentSessionRuntimeState
} from '../core/session-runtime-state'
import { EventQueue } from './event-queue'
import { AgentPermissionRequestQueue } from './permission-request-queue'
import type { AgentPermissionDecision } from './types'

export type AgentPermissionRuntimeInput = {
  agentSessionState: AgentSessionRuntimeState
}

export type AgentPermissionRuntimeRequestInput = {
  eventQueue: EventQueue | null
  request: AgentPermissionRequest
  turnId: string | null
}

/**
 * 集中维护权限请求从发起、排队、响应到会话记忆写入的运行时闭环。
 */
export class AgentPermissionRuntime {
  private readonly agentSessionState: AgentSessionRuntimeState
  private readonly requestQueue = new AgentPermissionRequestQueue()

  /**
   * 保存 alwaysAllow 写入所需的会话运行态。
   */
  constructor({ agentSessionState }: AgentPermissionRuntimeInput) {
    this.agentSessionState = agentSessionState
  }

  /**
   * 把权限请求入队成 agent 事件，并返回等待用户决策的 promise。
   */
  requestPermission({
    eventQueue,
    request,
    turnId
  }: AgentPermissionRuntimeRequestInput): Promise<AgentPermissionDecision> {
    if (eventQueue === null) {
      return Promise.resolve({
        requestId: request.requestId,
        approved: false,
        reason: 'No active agent event queue.'
      })
    }

    const decisionPromise = this.requestQueue.create(request)

    eventQueue.enqueue({
      type: 'permission_request',
      request,
      ...(turnId === null ? {} : { turnId })
    })

    return decisionPromise
  }

  /**
   * 响应一个挂起权限请求，并在 alwaysAllow 通过时写入 session grant。
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    const response = this.requestQueue.respond(requestId, allowed, alwaysAllow)

    if (response === null) {
      return
    }

    if (response.decision.approved && response.decision.alwaysAllow === true) {
      addPermissionGrantFromRequest(this.agentSessionState, response.request)
    }
  }

  /**
   * 用同一个拒绝原因释放所有挂起权限请求。
   */
  rejectAll(reason: string): void {
    this.requestQueue.rejectAll(reason)
  }
}
