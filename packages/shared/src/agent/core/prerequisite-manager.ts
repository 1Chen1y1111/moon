/**
 * 负责 Claude-first 链路里的最小 prerequisite 检查。
 * v1 只处理 active MCP source tool 的 guide 阅读要求，不做 skill、browser 或文件系统校验。
 */

import { isAbsolute, resolve } from 'node:path'

import type { ClaudeToolUsePermissionInput } from './pre-tool-use'
import { resolveWorkspacePath } from './pre-tool-use'
import {
  addSourceGuideRead,
  hasSourceGuideRead,
  type AgentSessionRuntimeState
} from './session-runtime-state'
import type { AgentSourceRecord } from './source-manager'
import type { AgentWorkspaceContext } from './types'

export type PrerequisiteCheckResult =
  | { type: 'allow' }
  | { type: 'block'; reason: string }

export type PrerequisiteManagerInput = {
  agentSessionState: AgentSessionRuntimeState
  workspace?: AgentWorkspaceContext
}

/**
 * 从 Claude `Read` 工具输入中读取 guide 文件路径；v1 不识别 Bash cat 或其它路径字段。
 */
function readClaudeReadFilePath(input: Record<string, unknown>): string | null {
  const filePath = input.file_path

  return typeof filePath === 'string' && filePath.trim().length > 0 ? filePath : null
}

/**
 * 从 `mcp__{sourceSlug}__{tool}` 工具名中提取 source slug。
 */
function readMcpSourceSlug(toolName: string): string | null {
  const parts = toolName.split('__')

  if (parts.length < 3 || parts[0] !== 'mcp' || parts[1] === undefined || parts[1] === '') {
    return null
  }

  return parts[1]
}

/**
 * 在 workspace 边界内归一化 source guide 路径；没有 workspace 时只接受绝对路径。
 */
function normalizeSourceGuidePath(
  workspace: AgentWorkspaceContext | undefined,
  guidePath: string
): string | null {
  const trimmedGuidePath = guidePath.trim()

  if (trimmedGuidePath.length === 0) {
    return null
  }

  if (workspace === undefined) {
    return isAbsolute(trimmedGuidePath) ? resolve(trimmedGuidePath) : null
  }

  return resolveWorkspacePath(workspace.path, trimmedGuidePath)
}

/**
 * 判断 source 是否是当前需要 prerequisite 管理的 active source。
 */
function isSourceWithGuide(source: AgentSourceRecord): source is AgentSourceRecord & {
  guidePath: string
} {
  return (
    source.status === 'active' &&
    typeof source.guidePath === 'string' &&
    source.guidePath.trim().length > 0
  )
}

/**
 * 维护当前会话的 source guide 阅读状态，并在 source tool 调用前执行最小前置检查。
 */
export class PrerequisiteManager {
  private readonly agentSessionState: AgentSessionRuntimeState
  private readonly workspace?: AgentWorkspaceContext

  /**
   * 保存 prerequisite 检查需要的会话内存态和 workspace 路径归一化上下文。
   */
  constructor({ agentSessionState, workspace }: PrerequisiteManagerInput) {
    this.agentSessionState = agentSessionState
    this.workspace = workspace
  }

  /**
   * 在 source tool 执行前检查对应 source guide 是否已经被当前会话读取。
   */
  checkClaudeToolUse(
    { toolName }: ClaudeToolUsePermissionInput,
    sources: readonly AgentSourceRecord[]
  ): PrerequisiteCheckResult {
    const sourceSlug = readMcpSourceSlug(toolName)

    if (sourceSlug === null) {
      return { type: 'allow' }
    }

    const source = sources.find((candidate) => candidate.slug === sourceSlug)

    if (source === undefined || !isSourceWithGuide(source)) {
      return { type: 'allow' }
    }

    const normalizedGuidePath = normalizeSourceGuidePath(this.workspace, source.guidePath)

    if (
      normalizedGuidePath === null ||
      hasSourceGuideRead(this.agentSessionState.sourceGuideReads, source.slug, normalizedGuidePath)
    ) {
      return { type: 'allow' }
    }

    return {
      type: 'block',
      reason: `使用 source "${source.slug}" 的工具前，必须先用 Read 读取 source guide：${source.guidePath}。`
    }
  }

  /**
   * 记录 Claude `Read.file_path` 命中的 active source guide，供后续 source tool 放行前置检查。
   */
  trackClaudeToolUse(
    { toolInput = {}, toolName }: ClaudeToolUsePermissionInput,
    sources: readonly AgentSourceRecord[]
  ): void {
    if (toolName !== 'Read') {
      return
    }

    const readFilePath = readClaudeReadFilePath(toolInput)

    if (readFilePath === null) {
      return
    }

    const normalizedReadPath = normalizeSourceGuidePath(this.workspace, readFilePath)

    if (normalizedReadPath === null) {
      return
    }

    for (const source of sources) {
      if (!isSourceWithGuide(source)) {
        continue
      }

      const normalizedGuidePath = normalizeSourceGuidePath(this.workspace, source.guidePath)

      if (normalizedGuidePath === null || normalizedGuidePath !== normalizedReadPath) {
        continue
      }

      addSourceGuideRead(this.agentSessionState, {
        sourceSlug: source.slug,
        guidePath: normalizedGuidePath
      })
    }
  }
}
