/**
 * 负责定义 agent 会话内的短生命周期运行时状态。
 * 当前只保存权限记忆和 source guide 阅读状态，不做持久化或跨线程共享。
 */

import type { AgentPermissionRequest } from '@moon/core/types'

export type AgentPermissionGrant = {
  command?: string
  path?: string
  toolName: string
  type?: AgentPermissionRequest['type']
}

export type AgentSourceGuideRead = {
  guidePath: string
  sourceSlug: string
}

export type AgentSessionRuntimeState = {
  permissionGrants: AgentPermissionGrant[]
  sourceGuideReads: AgentSourceGuideRead[]
}

/**
 * 创建一个新的 agent 会话运行时状态容器。
 */
export function createAgentSessionRuntimeState(): AgentSessionRuntimeState {
  return {
    permissionGrants: [],
    sourceGuideReads: []
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

/**
 * 判断当前会话是否已经读取过指定 source guide。
 */
export function hasSourceGuideRead(
  reads: readonly AgentSourceGuideRead[],
  sourceSlug: string,
  guidePath: string
): boolean {
  return reads.some((read) => read.sourceSlug === sourceSlug && read.guidePath === guidePath)
}

/**
 * 把 source guide 阅读记录写入会话状态；重复读取时保持幂等。
 */
export function addSourceGuideRead(
  state: AgentSessionRuntimeState,
  read: AgentSourceGuideRead
): AgentSourceGuideRead {
  if (!hasSourceGuideRead(state.sourceGuideReads, read.sourceSlug, read.guidePath)) {
    state.sourceGuideReads.push(read)
  }

  return read
}
