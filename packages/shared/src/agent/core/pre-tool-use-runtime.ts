/**
 * 负责 Claude-first PreToolUse 运行时编排。
 * 这里只组合 source、prerequisite 和权限管线，不执行 SDK hook、UI 审批或工具调用。
 */

import type {
  AgentToolPermissionCheckResult,
  ClaudeToolUsePermissionInput,
  PermissionManager
} from './permission-manager'
import type { PrerequisiteManager } from './prerequisite-manager'
import { runPreToolUseChecks } from './pre-tool-use'
import type { AgentSessionRuntimeState } from './session-runtime-state'
import type { SourceManager } from './source-manager'
import type { AgentPermissionMode } from './types'

/**
 * 描述一次 Claude PreToolUse runtime 编排所需的共享 manager 和会话状态。
 */
export type AgentPreToolUseRuntimeInput = {
  agentSessionState: AgentSessionRuntimeState
  input: ClaudeToolUsePermissionInput
  permissionManager?: PermissionManager
  permissionMode?: AgentPermissionMode
  prerequisiteManager: PrerequisiteManager
  sourceManager: SourceManager
}

/**
 * 按 Moon Claude-first 顺序运行 source activation、guide prerequisite、权限规则和 guide read 跟踪。
 */
export function runAgentPreToolUseRuntime({
  agentSessionState,
  input,
  permissionManager,
  permissionMode,
  prerequisiteManager,
  sourceManager
}: AgentPreToolUseRuntimeInput): AgentToolPermissionCheckResult {
  const sources = sourceManager.listSources()
  const sourceActivation = sourceManager.checkInactiveMcpSourceTool(input.toolName)
  const sourceTool = sourceManager.checkKnownMcpSourceTool(input.toolName)
  const prerequisiteCheck = prerequisiteManager.checkClaudeToolUse(input, sources)
  const prerequisite = prerequisiteCheck.type === 'block' ? prerequisiteCheck : null

  const permissionResult =
    permissionManager === undefined
      ? runPreToolUseChecks({
          ...input,
          permissionMode,
          permissionGrants: agentSessionState.permissionGrants,
          prerequisite,
          sourceActivation,
          sourceTool
        })
      : permissionManager.checkClaudeToolUse(input, {
          permissionGrants: agentSessionState.permissionGrants,
          prerequisite,
          sourceActivation,
          sourceTool
        })

  if (permissionResult.type === 'allow' || permissionResult.type === 'modify') {
    prerequisiteManager.trackClaudeToolUse(
      permissionResult.type === 'modify'
        ? { ...input, toolInput: permissionResult.toolInput }
        : input,
      sources
    )
  }

  return permissionResult
}
