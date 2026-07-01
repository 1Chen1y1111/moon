/**
 * 负责解析 Claude Agent SDK 内置的 Claude Code 可执行文件。
 * 本文件只处理显式 env、Node 解析和 pnpm 虚拟 store 兼容，不组装 SDK query options。
 */

import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ClaudeCodeExecutableResolverInput = {
  baseEnv?: NodeJS.ProcessEnv
  moduleDirectory?: string
  searchRoots?: string[]
}

type NormalizedClaudeCodeExecutableResolverInput = {
  baseEnv: NodeJS.ProcessEnv
  moduleDirectory: string
  searchRoots: string[]
}

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

/**
 * 判断候选路径是否存在，避免把空 env 值传入 SDK。
 */
function pathExists(path: string | undefined): path is string {
  return path !== undefined && existsSync(path)
}

/**
 * 返回真实路径；遇到临时 fixture 或文件系统竞态时回退到普通绝对路径。
 */
function toComparablePath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/**
 * 判断 Node 解析结果是否仍落在当前搜索根内，避免 createRequire 向外层依赖漂移。
 */
function isPathInsideDirectory(path: string, directory: string): boolean {
  const relativePath = relative(toComparablePath(directory), toComparablePath(path))

  return relativePath.length === 0 || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

/**
 * 判断调用方传入的是新 resolver options，还是旧版 baseEnv 参数。
 */
function isResolverInput(
  input: NodeJS.ProcessEnv | ClaudeCodeExecutableResolverInput
): input is ClaudeCodeExecutableResolverInput {
  return 'baseEnv' in input || 'moduleDirectory' in input || 'searchRoots' in input
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
 * 生成默认搜索根，覆盖当前 cwd、模块目录和它们的上级目录。
 */
function createDefaultSearchRoots(moduleDirectory: string): string[] {
  return [
    process.cwd(),
    moduleDirectory,
    ...listAncestorDirectories(process.cwd()),
    ...listAncestorDirectories(moduleDirectory)
  ]
}

/**
 * 兼容旧的 `resolveClaudeCodeExecutablePath(baseEnv)` 调用，同时允许测试注入 searchRoots。
 */
function normalizeResolverInput(
  input: NodeJS.ProcessEnv | ClaudeCodeExecutableResolverInput = process.env
): NormalizedClaudeCodeExecutableResolverInput {
  const resolverInput = isResolverInput(input) ? input : undefined
  const moduleDirectory =
    resolverInput?.moduleDirectory !== undefined
      ? resolverInput.moduleDirectory
      : dirname(fileURLToPath(import.meta.url))
  const baseEnv =
    resolverInput?.baseEnv !== undefined
      ? resolverInput.baseEnv
      : resolverInput === undefined
        ? (input as NodeJS.ProcessEnv)
        : process.env
  const searchRoots =
    resolverInput?.searchRoots !== undefined
      ? resolverInput.searchRoots
      : createDefaultSearchRoots(moduleDirectory)

  return {
    baseEnv,
    moduleDirectory,
    searchRoots: [...new Set(searchRoots.map((directory) => resolve(directory)))]
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
    if (!isPathInsideDirectory(sdkEntry, directory)) {
      return undefined
    }

    const candidate = createRequire(sdkEntry).resolve(
      `@anthropic-ai/${packageName}/${resolveClaudeAgentSdkNativeBinaryName()}`
    )

    return isPathInsideDirectory(candidate, directory) ? candidate : undefined
  } catch {
    return undefined
  }
}

/**
 * 用 Node 解析规则查找旧版 SDK 包内 CLI；Electron bundle 下失败时再由文件系统兜底。
 */
function resolveClaudeAgentSdkCliFromRequire(directory: string): string | undefined {
  try {
    const candidate = createRequire(join(directory, 'package.json')).resolve(
      '@anthropic-ai/claude-agent-sdk/cli.js'
    )

    return isPathInsideDirectory(candidate, directory) ? candidate : undefined
  } catch {
    return undefined
  }
}

/**
 * 解析传给 Claude Agent SDK 的 Claude Code 可执行路径，优先兼容新版原生二进制。
 */
export function resolveClaudeCodeExecutablePath(
  input?: NodeJS.ProcessEnv | ClaudeCodeExecutableResolverInput
): string | undefined {
  const { baseEnv, searchRoots } = normalizeResolverInput(input)

  for (const envKey of claudeCodeExecutableEnvKeys) {
    if (pathExists(baseEnv[envKey])) {
      return baseEnv[envKey]
    }
  }

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
 * 生成找不到 Claude Code 可执行文件时的诊断摘要；只暴露 env key 名称，不回显 env 值。
 */
export function createClaudeCodeExecutableDiagnostic(
  input?: NodeJS.ProcessEnv | ClaudeCodeExecutableResolverInput
): string {
  const { baseEnv, searchRoots } = normalizeResolverInput(input)
  const configuredEnvKeys = claudeCodeExecutableEnvKeys.filter((envKey) => {
    const value = baseEnv[envKey]?.trim()

    return value !== undefined && value.length > 0
  })
  const nativePackageName = resolveClaudeAgentSdkNativePackageName() ?? 'unsupported'

  return [
    'Claude Code executable was not found.',
    `checkedEnvKeys=${configuredEnvKeys.join(',') || 'none'}`,
    `nativePackage=${nativePackageName}`,
    `binary=${resolveClaudeAgentSdkNativeBinaryName()}`,
    `searchRoots=${searchRoots.length}`
  ].join(' ')
}
