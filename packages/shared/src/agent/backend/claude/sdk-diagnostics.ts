/**
 * 负责 Claude SDK 运行时错误诊断的内部边界。
 * 它只处理 stderr 短缓冲、运行时摘要和错误详情脱敏，不参与事件流或权限判断。
 */

import type { createClaudeQueryOptions } from '../internal/runtime-resolver'

export type CreateClaudeSdkErrorMessageInput = {
  apiKey?: string
  message: string
  runtimeSummary?: string
  stderr: string
}

/**
 * 判断 Claude SDK 返回的错误是否缺乏可诊断信息，需要用 stderr 详情兜底。
 */
function isUnhelpfulClaudeErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase()

  return (
    normalizedMessage.length === 0 ||
    normalizedMessage === 'unknown' ||
    normalizedMessage === 'claude sdk query failed.'
  )
}

/**
 * 判断 Claude SDK 是否只返回了认证错误码，需要追加运行时摘要辅助定位。
 */
function isClaudeAuthenticationErrorMessage(message: string): boolean {
  return message.trim().toLowerCase() === 'authentication_failed'
}

/**
 * 清理 Claude SDK stderr 详情，避免把当前连接的 API key 回显到 UI 或日志。
 */
function sanitizeClaudeErrorDetail(detail: string, apiKey?: string): string {
  const trimmedDetail = detail.trim()

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return trimmedDetail
  }

  return trimmedDetail.split(apiKey.trim()).join('[redacted]')
}

/**
 * 生成不含密钥的 Claude SDK 运行时摘要，用于认证错误诊断。
 */
export function createClaudeRuntimeSummary(
  options: ReturnType<typeof createClaudeQueryOptions>
): string {
  const env = options.env ?? {}
  const authEnvKeys = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN'
  ].filter((key) => env[key] !== undefined)
  const baseUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : 'default'
  const claudeConfig = env.CLAUDE_CONFIG_DIR === undefined ? 'default' : 'isolated'
  const debugFile = options.debugFile === undefined ? '' : `, debugFile=${options.debugFile}`

  return `runtime: model=${options.model}, baseUrl=${baseUrl}, authEnv=${authEnvKeys.join(', ') || 'default'}, claudeConfig=${claudeConfig}${debugFile}`
}

/**
 * 在 SDK 只返回 unknown 等空泛错误时，用 stderr 中的真实原因构造展示文案。
 */
export function createClaudeSdkErrorMessage({
  apiKey,
  message,
  runtimeSummary,
  stderr
}: CreateClaudeSdkErrorMessageInput): string {
  const sanitizedStderr = sanitizeClaudeErrorDetail(stderr, apiKey)
  const isAuthenticationError = isClaudeAuthenticationErrorMessage(message)
  const isUnhelpfulError = isUnhelpfulClaudeErrorMessage(message)
  const diagnosticSuffix =
    (isAuthenticationError || isUnhelpfulError) && runtimeSummary !== undefined
      ? ` (${runtimeSummary})`
      : ''

  if (sanitizedStderr.length === 0) {
    return isAuthenticationError
      ? `Claude SDK authentication failed: ${message}${diagnosticSuffix}`
      : isUnhelpfulError
        ? `Claude SDK failed: ${message}${diagnosticSuffix}`
        : message
  }

  if (!isUnhelpfulError && !isAuthenticationError) {
    return message
  }

  return `Claude SDK failed: ${sanitizedStderr}${diagnosticSuffix}`
}

/**
 * 收集 Claude Code 子进程 stderr 的短缓冲，用于补全 SDK 返回的 unknown 错误。
 */
export class ClaudeStderrBuffer {
  private value = ''

  /**
   * 追加 stderr 片段并限制最大长度，避免异常日志撑爆消息。
   */
  append(data: string): void {
    this.value = `${this.value}${data}`.slice(-4000)
  }

  /**
   * 返回当前缓冲内容。
   */
  read(): string {
    return this.value
  }
}
