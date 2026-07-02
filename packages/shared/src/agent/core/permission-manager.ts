/**
 * 负责 agent backend 运行时共享的工具权限规则和 workspace 路径边界校验。
 * 它只做纯规则判断，不执行文件系统、命令或 SDK 副作用。
 */

import type { AgentPermissionMode, AgentWorkspaceContext } from './types'
import {
  runPreToolUseChecks,
  type AgentToolPermissionCheckResult,
  type ClaudeToolUsePermissionInput,
  type PreToolUsePrerequisite,
  type PreToolUseSourceActivation,
  type PreToolUseSourceTool
} from './pre-tool-use'
import type { AgentPermissionGrant } from './session-runtime-state'

export type PermissionManagerInput = {
  permissionMode?: AgentPermissionMode
  workspace: AgentWorkspaceContext
}

export type PermissionManagerCheckOptions = {
  permissionGrants?: readonly AgentPermissionGrant[]
  prerequisite?: PreToolUsePrerequisite | null
  sourceActivation?: PreToolUseSourceActivation | null
  sourceTool?: PreToolUseSourceTool | null
}

export {
  isClaudeToolInputInsideWorkspace,
  isPathInsideWorkspace,
  resolveWorkspacePath,
  type AgentToolPermissionCheckResult,
  type ClaudeToolUsePermissionInput
} from './pre-tool-use'

/**
 * 集中管理 agent 工具权限规则，作为 SDK adapter 和未来 backend 复用的判断边界。
 */
export class PermissionManager {
  private readonly permissionMode: AgentPermissionMode
  private readonly workspace: AgentWorkspaceContext

  /**
   * 保存权限判断所需的 workspace 边界和默认权限模式。
   */
  constructor({ permissionMode = 'ask', workspace }: PermissionManagerInput) {
    this.permissionMode = permissionMode
    this.workspace = workspace
  }

  /**
   * 检查 Claude Code SDK PreToolUse 请求，并委托 PreToolUse 管线统一生成决策结果。
   */
  checkClaudeToolUse({
    toolInput = {},
    toolName,
    toolUseId
  }: ClaudeToolUsePermissionInput,
  options: PermissionManagerCheckOptions = {}): AgentToolPermissionCheckResult {
    return runPreToolUseChecks({
      permissionMode: this.permissionMode,
      permissionGrants: options.permissionGrants,
      prerequisite: options.prerequisite,
      sourceActivation: options.sourceActivation,
      sourceTool: options.sourceTool,
      toolInput,
      toolName,
      toolUseId,
      workspace: this.workspace
    })
  }
}
