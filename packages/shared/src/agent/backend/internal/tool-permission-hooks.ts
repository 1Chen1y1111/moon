/**
 * 负责把 Claude SDK PreToolUse hook 输入适配到 Moon 工具权限规则。
 * 本文件只处理 SDK hook 与 BaseAgent 权限能力的桥接，不解析 runtime/env/executable。
 */

import type { HookInput, HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'
import type { AgentPermissionDecision, AgentPermissionRequest } from '@moon/core/types'

import type {
  AgentToolPermissionCheckResult,
  ClaudeToolUsePermissionInput
} from '../../core'

type ClaudePreToolUseCheckResult = AgentToolPermissionCheckResult

/**
 * 负责把 Claude SDK 工具权限请求交给 Moon UI，并等待用户决策。
 */
export type ClaudeToolPermissionRequester = (
  request: AgentPermissionRequest
) => Promise<AgentPermissionDecision>

/**
 * 负责执行 Claude 工具权限规则，通常由 BaseAgent 绑定 PermissionManager 后传入。
 */
export type ClaudeToolUseChecker = (
  input: ClaudeToolUsePermissionInput
) => ClaudePreToolUseCheckResult

/**
 * 负责通知调用方某次 Claude 工具调用已被阻止，通常用于事件适配器补全 tool_result。
 */
export type ClaudeToolUseBlockedReporter = (
  input: ClaudeToolUsePermissionInput,
  reason: string
) => void

export type ClaudePreToolUseHooksInput = {
  checkToolUse: ClaudeToolUseChecker
  onToolUseBlocked?: ClaudeToolUseBlockedReporter
  requestPermission?: ClaudeToolPermissionRequester
}

/**
 * 安全读取 hook payload 中的普通对象字段，避免 SDK 传入非对象 tool input 时抛错。
 */
function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/**
 * 把 Claude SDK PreToolUse payload 转换成 core PermissionManager 可识别的输入。
 */
function createClaudeToolUsePermissionInput(
  input: Extract<HookInput, { hook_event_name: 'PreToolUse' }>
): ClaudeToolUsePermissionInput {
  return {
    toolName: input.tool_name,
    toolUseId: input.tool_use_id,
    toolInput: readRecord(input.tool_input)
  }
}

/**
 * 创建 Claude SDK PreToolUse hooks，并把检查结果翻译成 SDK hook 输出。
 */
export function createClaudePreToolUseHooks({
  checkToolUse,
  onToolUseBlocked,
  requestPermission
}: ClaudePreToolUseHooksInput): Options['hooks'] {
  return {
    PreToolUse: [
      {
        hooks: [
          async (input: HookInput): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== 'PreToolUse') {
              return { continue: true }
            }

            const permissionInput = createClaudeToolUsePermissionInput(input)
            const checkResult = checkToolUse(permissionInput)

            if (checkResult.type === 'prompt') {
              if (requestPermission === undefined) {
                const reason = 'Moon 当前阶段需要 UI 审批后才允许执行该工具。'

                onToolUseBlocked?.(permissionInput, reason)

                return {
                  continue: false,
                  decision: 'block',
                  reason
                }
              }

              const decision = await requestPermission(checkResult.request)

              if (decision.approved) {
                return { continue: true }
              }

              const reason = decision.reason ?? 'User denied permission'

              onToolUseBlocked?.(permissionInput, reason)

              return {
                continue: false,
                decision: 'block',
                reason
              }
            }

            if (checkResult.type === 'block') {
              onToolUseBlocked?.(permissionInput, checkResult.reason)

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
