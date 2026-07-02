/**
 * 负责解析 agent backend 运行时参数和 SDK 调用选项。
 * 它只处理 backend context、进程环境与 SDK options 的组装，不负责事件转换、会话持久化或 UI 状态。
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { ThinkingLevel } from '../../../config'
import type { AgentSessionRuntimeState } from '../../core/session-runtime-state'
import type { AgentPermissionMode } from '../../core/types'
import type { AgentSourceRecord } from '../../core/source-manager'
import type { AgentBackendConfig, AgentBackendMessage, AgentBackendWorkspace } from '../types'
import { resolveClaudeCodeExecutablePath } from './claude-code-executable'
import type { ProviderRuntimeResolution } from './driver-types'

export {
  createClaudeCodeExecutableDiagnostic,
  resolveClaudeCodeExecutablePath
} from './claude-code-executable'

const thinkingLevelTokenBudgets: Record<ThinkingLevel, number> = {
  low: 1024,
  medium: 4096,
  high: 8192
}

export type ClaudeRuntimeEnvInput = {
  apiKey?: string
  baseEnv?: NodeJS.ProcessEnv
  baseUrl?: string
  model?: string
}

export type ClaudeQueryOptionsInput = ClaudeRuntimeEnvInput & {
  abortController: AbortController
  hooks?: Options['hooks']
  model: string
  stderr?: (data: string) => void
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

/**
 * 描述 provider driver 解析完成后，创建具体 agent backend 所需的统一运行时上下文。
 */
export type AgentBackendRuntimeContext = {
  agentSessionState?: AgentSessionRuntimeState
  provider: ProviderRuntimeResolution['provider']
  model: string
  apiKey?: string
  baseUrl?: string
  messages: AgentBackendMessage[]
  permissionMode?: AgentPermissionMode
  sources?: AgentSourceRecord[]
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

/**
 * 描述把 backend config 和 provider 专属解析结果合并为 runtime context 的输入。
 */
export type ResolveAgentBackendRuntimeContextInput = {
  config: AgentBackendConfig
  providerRuntime: ProviderRuntimeResolution
}

const claudeCodeUnsupportedTools = ['EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion', 'Skill']
const claudeManagedEnvKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR'
] as const

/**
 * 判断当前 Claude SDK 调用是否走自定义 Claude-compatible endpoint。
 */
function shouldUseCustomClaudeEndpoint(baseUrl: string | undefined): boolean {
  return baseUrl !== undefined
}

/**
 * 移除 Moon 受管的 Claude 环境变量，避免 shell 或本机 Claude 登录状态污染当前连接。
 */
function sanitizeClaudeBaseEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...baseEnv }

  for (const key of claudeManagedEnvKeys) {
    delete env[key]
  }

  return env
}

/**
 * 返回 Moon 专用 Claude Code 配置目录，阻断 SDK 读取用户主目录里的 Claude 凭据。
 */
function resolveMoonClaudeConfigDirectory(baseEnv: NodeJS.ProcessEnv): string {
  const configuredDirectory = baseEnv.MOON_CLAUDE_CONFIG_DIR?.trim()
  const directory =
    configuredDirectory === undefined || configuredDirectory.length === 0
      ? join(tmpdir(), 'moon-claude-code')
      : configuredDirectory

  mkdirSync(directory, { recursive: true })
  return directory
}

/**
 * 返回 Claude Code debug 日志路径，仅用于 custom endpoint 失败时继续诊断。
 */
function resolveMoonClaudeDebugFile(baseEnv: NodeJS.ProcessEnv): string {
  const configuredFile = baseEnv.MOON_CLAUDE_DEBUG_FILE?.trim()
  const debugFile =
    configuredFile === undefined || configuredFile.length === 0
      ? join(resolveMoonClaudeConfigDirectory(baseEnv), 'debug.log')
      : configuredFile

  mkdirSync(dirname(debugFile), { recursive: true })
  return debugFile
}

/**
 * 构造追加到 Claude Code preset system prompt 的 Moon workspace 说明。
 */
export function buildClaudeWorkspaceSystemPrompt(workspace: AgentBackendWorkspace): string {
  return [
    `当前 Moon 项目：${workspace.name ?? '未命名项目'}`,
    `项目根目录：${workspace.path}`,
    '你必须把当前工作目录视为项目 workspace 边界。',
    '当前阶段允许使用只读工具理解项目；Bash、Edit、Write、MultiEdit 会等待用户确认。'
  ].join('\n')
}

/**
 * 解析 Claude SDK 需要的环境变量；没有覆盖项时返回 undefined 以保留 SDK 默认发现逻辑。
 */
export function resolveClaudeRuntimeEnv({
  apiKey,
  baseEnv = process.env,
  baseUrl,
  model
}: ClaudeRuntimeEnvInput): NodeJS.ProcessEnv | undefined {
  if (apiKey === undefined && baseUrl === undefined) {
    return undefined
  }

  const usesCustomEndpoint = shouldUseCustomClaudeEndpoint(baseUrl)

  return {
    ...sanitizeClaudeBaseEnv(baseEnv),
    ...(apiKey === undefined
      ? {}
      : usesCustomEndpoint
        ? { ANTHROPIC_AUTH_TOKEN: apiKey }
        : { ANTHROPIC_API_KEY: apiKey }),
    ...(baseUrl === undefined ? {} : { ANTHROPIC_BASE_URL: baseUrl }),
    ...(usesCustomEndpoint ? { CLAUDE_CONFIG_DIR: resolveMoonClaudeConfigDirectory(baseEnv) } : {}),
    ...(usesCustomEndpoint && model !== undefined
      ? {
          ANTHROPIC_MODEL: model,
          ANTHROPIC_DEFAULT_OPUS_MODEL: model,
          ANTHROPIC_DEFAULT_SONNET_MODEL: model,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
          CLAUDE_CODE_SUBAGENT_MODEL: model,
          CLAUDE_CODE_EFFORT_LEVEL: 'max'
        }
      : {})
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
 * 合并 provider driver 解析结果和统一 backend config，形成 factory 创建 backend 的单一上下文。
 */
export function resolveAgentBackendRuntimeContext({
  config,
  providerRuntime
}: ResolveAgentBackendRuntimeContextInput): AgentBackendRuntimeContext {
  return {
    provider: providerRuntime.provider,
    ...(config.agentSessionState === undefined
      ? {}
      : { agentSessionState: config.agentSessionState }),
    apiKey: providerRuntime.apiKey,
    baseUrl: providerRuntime.baseUrl,
    messages: config.messages ?? [],
    model: providerRuntime.model,
    permissionMode: config.permissionMode,
    sources: config.sources,
    thinkingLevel: config.thinkingLevel,
    workspace: config.workspace
  }
}

/**
 * 构造 Claude SDK query 调用的标准 options，调用方只需要传入本轮模型和取消控制器。
 */
export function createClaudeQueryOptions({
  abortController,
  apiKey,
  baseEnv,
  baseUrl,
  hooks,
  model,
  stderr,
  thinkingLevel,
  workspace
}: ClaudeQueryOptionsInput): Options {
  const env = resolveClaudeRuntimeEnv({ apiKey, baseEnv, baseUrl, model })
  const pathToClaudeCodeExecutable = resolveClaudeCodeExecutablePath(baseEnv)
  const usesCustomEndpoint = shouldUseCustomClaudeEndpoint(baseUrl)
  const debugFile = usesCustomEndpoint
    ? resolveMoonClaudeDebugFile(baseEnv ?? process.env)
    : undefined
  const maxThinkingTokens = usesCustomEndpoint
    ? undefined
    : resolveClaudeThinkingTokenBudget(thinkingLevel)
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
          ...(hooks === undefined ? {} : { hooks }),
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
    ...(pathToClaudeCodeExecutable === undefined ? {} : { pathToClaudeCodeExecutable }),
    ...(debugFile === undefined ? {} : { debugFile }),
    ...(stderr === undefined ? {} : { stderr }),
    ...workspaceOptions,
    ...(maxThinkingTokens === undefined ? {} : { maxThinkingTokens }),
    ...(env === undefined ? {} : { env })
  }
}
