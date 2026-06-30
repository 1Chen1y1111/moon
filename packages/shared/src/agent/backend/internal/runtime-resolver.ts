/**
 * 负责解析 agent backend 运行时参数和 SDK 调用选项。
 * 它只处理 backend context、进程环境与 SDK options 的组装，不负责事件转换、会话持久化或 UI 状态。
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ThinkingLevel } from '../../../config'
import type { AgentPermissionMode } from '../../core/types'
import type { AgentSourceRecord } from '../../core/source-manager'
import type {
  AgentBackendConfig,
  AgentBackendMessage,
  AgentBackendWorkspace
} from '../types'
import type { ProviderRuntimeResolution } from './driver-types'

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

export type ResolvedBackendContext = {
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

const claudeCodeUnsupportedTools = ['EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion', 'Skill']
const claudeCodeExecutableEnvKeys = [
  'MOON_CLAUDE_CODE_EXECUTABLE',
  'CLAUDE_CODE_EXECUTABLE'
] as const
const claudeAgentSdkCliRelativePath = join(
  'node_modules',
  '@anthropic-ai',
  'claude-agent-sdk',
  'cli.js'
)
const claudeAgentSdkPnpmPackagePrefix = '@anthropic-ai+claude-agent-sdk@'
const claudeAgentSdkNativePnpmPackagePrefix = '@anthropic-ai+'
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

function pathExists(path: string | undefined): path is string {
  return path !== undefined && existsSync(path)
}

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
 * 解析当前平台对应的 Claude Agent SDK 原生二进制包名。
 */
function resolveClaudeAgentSdkNativePackageName(): string | undefined {
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x64'

  if (process.platform === 'darwin') {
    return `claude-agent-sdk-darwin-${architecture}`
  }

  if (process.platform === 'win32') {
    return `claude-agent-sdk-win32-${architecture}`
  }

  if (process.platform === 'linux') {
    return `claude-agent-sdk-linux-${architecture}`
  }

  return undefined
}

/**
 * 返回当前平台的 Claude Agent SDK 原生可执行文件名。
 */
function resolveClaudeAgentSdkNativeBinaryName(): string {
  return process.platform === 'win32' ? 'claude.exe' : 'claude'
}

/**
 * 从起点目录逐级向上枚举候选目录，用于兼容 Electron bundle 和 monorepo cwd。
 */
function listAncestorDirectories(startDirectory: string): string[] {
  const directories: string[] = []
  let currentDirectory = resolve(startDirectory)
  const rootDirectory = parse(currentDirectory).root

  while (true) {
    directories.push(currentDirectory)

    if (currentDirectory === rootDirectory) {
      return directories
    }

    currentDirectory = dirname(currentDirectory)
  }
}

/**
 * 在 pnpm 虚拟 store 中查找新版 Claude Agent SDK 的原生可执行文件。
 */
function findPnpmClaudeAgentSdkNativeBinary(directory: string): string | undefined {
  const packageName = resolveClaudeAgentSdkNativePackageName()

  if (packageName === undefined) {
    return undefined
  }

  const pnpmDirectory = join(directory, 'node_modules', '.pnpm')

  if (!existsSync(pnpmDirectory)) {
    return undefined
  }

  const packagePrefix = `${claudeAgentSdkNativePnpmPackagePrefix}${packageName}@`
  const binaryName = resolveClaudeAgentSdkNativeBinaryName()

  for (const entry of readdirSync(pnpmDirectory)) {
    if (!entry.startsWith(packagePrefix)) {
      continue
    }

    const candidate = join(
      pnpmDirectory,
      entry,
      'node_modules',
      '@anthropic-ai',
      packageName,
      binaryName
    )

    if (existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

/**
 * 在 pnpm 虚拟 store 中查找旧版 Claude Agent SDK 自带的 CLI 文件。
 */
function findPnpmClaudeAgentSdkCli(directory: string): string | undefined {
  const pnpmDirectory = join(directory, 'node_modules', '.pnpm')

  if (!existsSync(pnpmDirectory)) {
    return undefined
  }

  for (const entry of readdirSync(pnpmDirectory)) {
    if (!entry.startsWith(claudeAgentSdkPnpmPackagePrefix)) {
      continue
    }

    const candidate = join(pnpmDirectory, entry, claudeAgentSdkCliRelativePath)

    if (existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

/**
 * 用 Node 解析规则查找新版 SDK optional dependency 里的原生可执行文件。
 */
function resolveClaudeAgentSdkNativeBinaryFromRequire(directory: string): string | undefined {
  const packageName = resolveClaudeAgentSdkNativePackageName()

  if (packageName === undefined) {
    return undefined
  }

  try {
    const sdkEntry = createRequire(join(directory, 'package.json')).resolve(
      '@anthropic-ai/claude-agent-sdk'
    )

    return createRequire(sdkEntry).resolve(
      `@anthropic-ai/${packageName}/${resolveClaudeAgentSdkNativeBinaryName()}`
    )
  } catch {
    return undefined
  }
}

/**
 * 用 Node 解析规则查找旧版 SDK 包内 CLI；Electron bundle 下失败时再由文件系统兜底。
 */
function resolveClaudeAgentSdkCliFromRequire(directory: string): string | undefined {
  try {
    return createRequire(join(directory, 'package.json')).resolve(
      '@anthropic-ai/claude-agent-sdk/cli.js'
    )
  } catch {
    return undefined
  }
}

/**
 * 解析传给 Claude Agent SDK 的 Claude Code 可执行路径，优先兼容新版原生二进制。
 */
export function resolveClaudeCodeExecutablePath(
  baseEnv: NodeJS.ProcessEnv = process.env
): string | undefined {
  for (const envKey of claudeCodeExecutableEnvKeys) {
    if (pathExists(baseEnv[envKey])) {
      return baseEnv[envKey]
    }
  }

  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const searchRoots = new Set([
    process.cwd(),
    moduleDirectory,
    ...listAncestorDirectories(process.cwd()),
    ...listAncestorDirectories(moduleDirectory)
  ])

  for (const directory of searchRoots) {
    const resolvedNativeByRequire = resolveClaudeAgentSdkNativeBinaryFromRequire(directory)

    if (pathExists(resolvedNativeByRequire)) {
      return resolvedNativeByRequire
    }

    const nativePackageName = resolveClaudeAgentSdkNativePackageName()

    if (nativePackageName !== undefined) {
      const directNativeCandidate = join(
        directory,
        'node_modules',
        '@anthropic-ai',
        nativePackageName,
        resolveClaudeAgentSdkNativeBinaryName()
      )

      if (existsSync(directNativeCandidate)) {
        return directNativeCandidate
      }
    }

    const pnpmNativeCandidate = findPnpmClaudeAgentSdkNativeBinary(directory)

    if (pnpmNativeCandidate !== undefined) {
      return pnpmNativeCandidate
    }
  }

  for (const directory of searchRoots) {
    const resolvedCliByRequire = resolveClaudeAgentSdkCliFromRequire(directory)

    if (pathExists(resolvedCliByRequire)) {
      return resolvedCliByRequire
    }

    const directCandidate = join(directory, claudeAgentSdkCliRelativePath)

    if (existsSync(directCandidate)) {
      return directCandidate
    }

    const pnpmCandidate = findPnpmClaudeAgentSdkCli(directory)

    if (pnpmCandidate !== undefined) {
      return pnpmCandidate
    }
  }

  return undefined
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
export function resolveBackendContext(
  config: AgentBackendConfig,
  providerRuntime: ProviderRuntimeResolution
): ResolvedBackendContext {
  return {
    provider: providerRuntime.provider,
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
