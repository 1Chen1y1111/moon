/**
 * 负责管理 agent backend 内部挂起的权限请求决策。
 * 它只保存 request 与 resolver，不负责把 permission_request 事件发送到 UI。
 */

import type { AgentPermissionRequest } from '@moon/core/types'

import type { AgentPermissionDecision } from './types'

export type AgentPermissionQueueResponse = {
  decision: AgentPermissionDecision
  request: AgentPermissionRequest
}

type PendingPermissionRequest = {
  request: AgentPermissionRequest
  resolve: (decision: AgentPermissionDecision) => void
}

/**
 * 桥接权限请求发起方和稍后到达的用户决策，供 BaseAgent 在 turn 生命周期内复用。
 */
export class AgentPermissionRequestQueue {
  private readonly pendingRequests = new Map<string, PendingPermissionRequest>()

  /**
   * 创建并保存一个等待用户决策的权限请求。
   */
  create(request: AgentPermissionRequest): Promise<AgentPermissionDecision> {
    return new Promise<AgentPermissionDecision>((resolve) => {
      this.pendingRequests.set(request.requestId, { request, resolve })
    })
  }

  /**
   * 响应一个挂起的权限请求；未知 requestId 会被忽略并返回 null。
   */
  respond(
    requestId: string,
    allowed: boolean,
    alwaysAllow?: boolean
  ): AgentPermissionQueueResponse | null {
    const pendingRequest = this.pendingRequests.get(requestId)

    if (pendingRequest === undefined) {
      return null
    }

    this.pendingRequests.delete(requestId)

    const decision: AgentPermissionDecision = allowed
      ? { requestId, approved: true, ...(alwaysAllow ? { alwaysAllow } : {}) }
      : { requestId, approved: false }

    pendingRequest.resolve(decision)

    return {
      decision,
      request: pendingRequest.request
    }
  }

  /**
   * 用同一个拒绝原因释放所有挂起权限请求，通常发生在 turn 结束、取消或销毁时。
   */
  rejectAll(reason: string): void {
    for (const [requestId, pendingRequest] of this.pendingRequests) {
      pendingRequest.resolve({ requestId, approved: false, reason })
    }

    this.pendingRequests.clear()
  }

  /**
   * 返回当前挂起请求数量，供测试和诊断确认清理语义。
   */
  get size(): number {
    return this.pendingRequests.size
  }
}
