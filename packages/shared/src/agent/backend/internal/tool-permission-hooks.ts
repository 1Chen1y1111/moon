/**
 * 负责把 Claude SDK PreToolUse hook 输入适配到 Moon 工具权限规则。
 * 本文件只处理 SDK hook 与 PermissionManager 的桥接，不解析 runtime/env/executable。
 */

import type { HookInput, HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'
import type { AgentPermissionDecision, AgentPermissionRequest } from '@moon/core/types'

import { PermissionManager, type AgentToolPermissionCheckResult } from '../../runtime'
import type { AgentPermissionMode } from '../../runtime/types'
import type { AgentBackendWorkspace } from '../types'

type ClaudePreToolUseCheckResult = AgentToolPermissionCheckResult

/**
 * 负责把 Claude SDK 工具权限请求交给 Moon UI，并等待用户决策。
 */
export type ClaudeToolPermissionRequester = (
  request: AgentPermissionRequest
) => Promise<AgentPermissionDecision>

/**
 * 安全读取 hook payload 中的普通对象字段，避免 SDK 传入非对象 tool input 时抛错。
 */
function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/**
 * 运行 Craft 风格的 Claude PreToolUse 检查：只读工具自动允许，命令和写操作按权限模式处理。
 */
export function runClaudePreToolUseChecks(
  workspace: AgentBackendWorkspace,
  input: Extract<HookInput, { hook_event_name: 'PreToolUse' }>,
  permissionMode: AgentPermissionMode = 'ask'
): ClaudePreToolUseCheckResult {
  return new PermissionManager({ permissionMode, workspace }).checkClaudeToolUse({
    toolName: input.tool_name,
    toolUseId: input.tool_use_id,
    toolInput: readRecord(input.tool_input)
  })
}

/**
 * 创建 Claude SDK PreToolUse hooks，并把检查结果翻译成 SDK hook 输出。
 */
export function createClaudePreToolUseHooks(
  workspace: AgentBackendWorkspace,
  requestPermission?: ClaudeToolPermissionRequester,
  permissionMode: AgentPermissionMode = 'ask'
): Options['hooks'] {
  return {
    PreToolUse: [
      {
        hooks: [
          async (input: HookInput): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== 'PreToolUse') {
              return { continue: true }
            }

            const checkResult = runClaudePreToolUseChecks(workspace, input, permissionMode)

            if (checkResult.type === 'prompt') {
              if (requestPermission === undefined) {
                return {
                  continue: false,
                  decision: 'block',
                  reason: 'Moon 当前阶段需要 UI 审批后才允许执行该工具。'
                }
              }

              const decision = await requestPermission(checkResult.request)

              if (decision.approved) {
                return { continue: true }
              }

              return {
                continue: false,
                decision: 'block',
                reason: decision.reason ?? 'User denied permission'
              }
            }

            if (checkResult.type === 'block') {
              return {
                continue: false,
                decision: 'block',
                reason: checkResult.reason
              }
            }

            return { continue: true }
          }
        ]
      }
    ]
  }
}
