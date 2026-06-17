/**
 * 负责解析 agent backend 运行时参数和 SDK 调用选项。
 * 它只处理进程环境与 SDK options 的组装，不负责事件转换、会话持久化或 UI 状态。
 */

import type { HookInput, HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'
import { isAbsolute, resolve } from 'node:path'

import type { ThinkingLevel } from '../../../config'
import { isPathInsideWorkspace, resolveWorkspacePath } from '../../runtime'
import type { AgentBackendWorkspace } from '../types'

const thinkingLevelTokenBudgets: Record<ThinkingLevel, number> = {
  low: 1024,
  medium: 4096,
  high: 8192
}

export type ClaudeRuntimeEnvInput = {
  apiKey?: string
  baseEnv?: NodeJS.ProcessEnv
  baseUrl?: string
}

export type ClaudeQueryOptionsInput = ClaudeRuntimeEnvInput & {
  abortController: AbortController
  model: string
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

const claudeReadOnlyTools = new Set(['Read', 'Glob', 'Grep', 'LS'])
const claudeCodeUnsupportedTools = ['EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion', 'Skill']

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function readStringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]

  return typeof field === 'string' && field.trim().length > 0 ? field : undefined
}

function resolveToolInputPath(input: Record<string, unknown>): string | undefined {
  return (
    readStringField(input, 'file_path') ??
    readStringField(input, 'path') ??
    readStringField(input, 'directory')
  )
}

/**
 * 判断 Claude Code SDK 工具输入是否仍位于当前 Moon workspace 内。
 */
export function isClaudeToolInputInsideWorkspace(
  workspace: AgentBackendWorkspace,
  input: Record<string, unknown>
): boolean {
  const inputPath = resolveToolInputPath(input)

  if (inputPath === undefined) {
    return true
  }

  const targetPath = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolveWorkspacePath(workspace.path, inputPath)

  return isPathInsideWorkspace(workspace.path, targetPath)
}

/**
 * 构造追加到 Claude Code preset system prompt 的 Moon workspace 说明。
 */
export function buildClaudeWorkspaceSystemPrompt(workspace: AgentBackendWorkspace): string {
  return [
    `当前 Moon 项目：${workspace.name ?? '未命名项目'}`,
    `项目根目录：${workspace.path}`,
    '你必须把当前工作目录视为项目 workspace 边界。',
    '当前阶段只允许使用只读工具理解项目；Bash、Edit、Write 等执行或修改类工具会被 Moon 阻止。'
  ].join('\n')
}

/**
 * 创建 Step 1 的 Claude SDK PreToolUse hooks：只允许只读工具，其他工具全部阻止。
 */
export function createClaudeReadOnlyToolHooks(workspace: AgentBackendWorkspace): Options['hooks'] {
  return {
    PreToolUse: [
      {
        hooks: [
          async (input: HookInput): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== 'PreToolUse') {
              return { continue: true }
            }

            if (!claudeReadOnlyTools.has(input.tool_name)) {
              return {
                continue: false,
                decision: 'block',
                reason: `Moon 当前阶段只允许 Claude Code SDK 只读工具，已阻止 ${input.tool_name}。`
              }
            }

            if (!isClaudeToolInputInsideWorkspace(workspace, readRecord(input.tool_input))) {
              return {
                continue: false,
                decision: 'block',
                reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
              }
            }

            return { continue: true }
          }
        ]
      }
    ]
  }
}

/**
 * 解析 Claude SDK 需要的环境变量；没有覆盖项时返回 undefined 以保留 SDK 默认发现逻辑。
 */
export function resolveClaudeRuntimeEnv({
  apiKey,
  baseEnv = process.env,
  baseUrl
}: ClaudeRuntimeEnvInput): NodeJS.ProcessEnv | undefined {
  if (apiKey === undefined && baseUrl === undefined) {
    return undefined
  }

  return {
    ...baseEnv,
    ...(apiKey === undefined ? {} : { ANTHROPIC_API_KEY: apiKey }),
    ...(baseUrl === undefined ? {} : { ANTHROPIC_BASE_URL: baseUrl })
  }
}

/**
 * 把 Moon 的 thinking level 映射为当前 Claude SDK 支持的 thinking token 上限。
 */
export function resolveClaudeThinkingTokenBudget(
  thinkingLevel: ThinkingLevel | undefined
): number | undefined {
  return thinkingLevel === undefined ? undefined : thinkingLevelTokenBudgets[thinkingLevel]
}

/**
 * 构造 Claude SDK query 调用的标准 options，调用方只需要传入本轮模型和取消控制器。
 */
export function createClaudeQueryOptions({
  abortController,
  apiKey,
  baseEnv,
  baseUrl,
  model,
  thinkingLevel,
  workspace
}: ClaudeQueryOptionsInput): Options {
  const env = resolveClaudeRuntimeEnv({ apiKey, baseEnv, baseUrl })
  const maxThinkingTokens = resolveClaudeThinkingTokenBudget(thinkingLevel)
  const workspaceOptions =
    workspace === undefined
      ? {
          permissionMode: 'dontAsk' as const,
          tools: []
        }
      : {
          allowDangerouslySkipPermissions: true,
          cwd: workspace.path,
          disallowedTools: claudeCodeUnsupportedTools,
          hooks: createClaudeReadOnlyToolHooks(workspace),
          permissionMode: 'bypassPermissions' as const,
          systemPrompt: {
            type: 'preset' as const,
            preset: 'claude_code' as const,
            append: buildClaudeWorkspaceSystemPrompt(workspace)
          },
          tools: { type: 'preset' as const, preset: 'claude_code' as const }
        }

  return {
    abortController,
    includePartialMessages: true,
    model,
    ...workspaceOptions,
    ...(maxThinkingTokens === undefined ? {} : { maxThinkingTokens }),
    ...(env === undefined ? {} : { env })
  }
}
