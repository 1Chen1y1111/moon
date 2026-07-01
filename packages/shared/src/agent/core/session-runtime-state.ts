/**
 * 负责定义 agent 会话内的短生命周期运行时状态。
 * v1 只保存权限记忆，不做持久化、跨线程共享或 source/skill 状态管理。
 */

import type { AgentPermissionRequest } from '@moon/core/types'

export type AgentPermissionGrant = {
  command?: string
  path?: string
  toolName: string
  type?: AgentPermissionRequest['type']
}

export type AgentSessionRuntimeState = {
  permissionGrants: AgentPermissionGrant[]
}

/**
 * 创建一个新的 agent 会话运行时状态容器。
 */
export function createAgentSessionRuntimeState(): AgentSessionRuntimeState {
  return {
    permissionGrants: []
  }
}

/**
 * 将权限请求规整成可复用的 grant 指纹。
 */
export function createPermissionGrantFromRequest(
  request: AgentPermissionRequest
): AgentPermissionGrant {
  return {
    toolName: request.toolName,
    ...(request.type === undefined ? {} : { type: request.type }),
    ...(request.command === undefined ? {} : { command: request.command }),
    ...(request.path === undefined ? {} : { path: request.path })
  }
}

/**
 * 生成权限 grant 的精确匹配指纹；缺少 command/path 时退化到 type + toolName。
 */
function createPermissionGrantFingerprint(grant: AgentPermissionGrant): string {
  const type = grant.type ?? 'unknown'

  if (grant.command !== undefined) {
    return `${type}\u0000${grant.toolName}\u0000command\u0000${grant.command}`
  }

  if (grant.path !== undefined) {
    return `${type}\u0000${grant.toolName}\u0000path\u0000${grant.path}`
  }

  return `${type}\u0000${grant.toolName}`
}

/**
 * 判断权限请求是否已被当前会话 grant 覆盖。
 */
export function hasPermissionGrant(
  grants: readonly AgentPermissionGrant[],
  request: AgentPermissionRequest
): boolean {
  const requestGrant = createPermissionGrantFromRequest(request)
  const requestFingerprint = createPermissionGrantFingerprint(requestGrant)

  return grants.some((grant) => createPermissionGrantFingerprint(grant) === requestFingerprint)
}

/**
 * 把权限请求写入会话状态；已有相同指纹时保持幂等。
 */
export function addPermissionGrantFromRequest(
  state: AgentSessionRuntimeState,
  request: AgentPermissionRequest
): AgentPermissionGrant {
  const grant = createPermissionGrantFromRequest(request)
  const grantFingerprint = createPermissionGrantFingerprint(grant)
  const exists = state.permissionGrants.some(
    (currentGrant) => createPermissionGrantFingerprint(currentGrant) === grantFingerprint
  )

  if (!exists) {
    state.permissionGrants.push(grant)
  }

  return grant
}
