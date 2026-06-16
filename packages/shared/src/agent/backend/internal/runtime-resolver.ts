/**
 * 负责解析 agent backend 运行时参数和 SDK 调用选项。
 * 它只处理进程环境与 SDK options 的组装，不负责事件转换、会话持久化或 UI 状态。
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk'

import type { ThinkingLevel } from '../../../config'

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
  thinkingLevel
}: ClaudeQueryOptionsInput): Options {
  const env = resolveClaudeRuntimeEnv({ apiKey, baseEnv, baseUrl })
  const maxThinkingTokens = resolveClaudeThinkingTokenBudget(thinkingLevel)

  return {
    abortController,
    includePartialMessages: true,
    model,
    permissionMode: 'dontAsk',
    tools: [],
    ...(maxThinkingTokens === undefined ? {} : { maxThinkingTokens }),
    ...(env === undefined ? {} : { env })
  }
}
