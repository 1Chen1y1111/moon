/**
 * 负责验证 Claude Code executable resolver 的查找优先级和诊断输出。
 * 测试只构造临时 node_modules 布局，不触发真实 Claude SDK。
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createClaudeCodeExecutableDiagnostic,
  resolveClaudeCodeExecutablePath
} from '../../../../src/agent/backend/internal/claude-code-executable'

/**
 * 返回测试运行平台对应的 Claude Agent SDK 原生包名。
 */
function resolveExpectedNativePackageName(): string {
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

  throw new Error(`Unsupported platform for Claude Agent SDK native test: ${process.platform}`)
}

/**
 * 返回测试运行平台对应的 Claude Code 原生二进制文件名。
 */
function resolveExpectedNativeBinaryName(): string {
  return process.platform === 'win32' ? 'claude.exe' : 'claude'
}

/**
 * 创建临时 resolver 根目录，测试结束后由调用方删除。
 */
function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'moon-claude-executable-'))
}

/**
 * 写入文件前确保父目录存在，方便构造不同 node_modules 布局。
 */
function writeFileWithParents(path: string, content = ''): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/**
 * 构造可被 createRequire 解析到的 Claude Agent SDK package。
 */
function writeClaudeAgentSdkPackage(root: string): void {
  const packageDirectory = join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')

  mkdirSync(packageDirectory, { recursive: true })
  writeFileSync(
    join(packageDirectory, 'package.json'),
    JSON.stringify({
      name: '@anthropic-ai/claude-agent-sdk',
      version: '0.0.0',
      main: 'index.js'
    })
  )
  writeFileSync(join(packageDirectory, 'index.js'), 'export {}\n')
}

describe('resolveClaudeCodeExecutablePath', () => {
  it('uses an existing explicit Claude Code executable path from env', () => {
    const root = createTempRoot()
    const executablePath = join(root, 'claude-cli.js')

    try {
      writeFileSync(executablePath, '#!/usr/bin/env node\n')

      expect(
        resolveClaudeCodeExecutablePath({
          baseEnv: { MOON_CLAUDE_CODE_EXECUTABLE: executablePath },
          searchRoots: [root]
        })
      ).toBe(executablePath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('prefers native executable resolved through Node package resolution', () => {
    const root = createTempRoot()
    const packageName = resolveExpectedNativePackageName()
    const binaryName = resolveExpectedNativeBinaryName()
    const executablePath = join(root, 'node_modules', '@anthropic-ai', packageName, binaryName)

    try {
      writeClaudeAgentSdkPackage(root)
      writeFileWithParents(executablePath)

      expect(resolveClaudeCodeExecutablePath({ baseEnv: {}, searchRoots: [root] })).toBe(
        realpathSync(executablePath)
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back to pnpm native executable layout when package resolution is unavailable', () => {
    const root = createTempRoot()
    const packageName = resolveExpectedNativePackageName()
    const binaryName = resolveExpectedNativeBinaryName()
    const executablePath = join(
      root,
      'node_modules',
      '.pnpm',
      `@anthropic-ai+${packageName}@0.2.123`,
      'node_modules',
      '@anthropic-ai',
      packageName,
      binaryName
    )

    try {
      writeFileWithParents(executablePath)

      expect(resolveClaudeCodeExecutablePath({ baseEnv: {}, searchRoots: [root] })).toBe(
        executablePath
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back to old SDK CLI layout when native executable is unavailable', () => {
    const root = createTempRoot()
    const executablePath = join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js')

    try {
      writeClaudeAgentSdkPackage(root)
      writeFileSync(executablePath, '#!/usr/bin/env node\n')

      expect(resolveClaudeCodeExecutablePath({ baseEnv: {}, searchRoots: [root] })).toBe(
        realpathSync(executablePath)
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns undefined and keeps missing-runtime diagnostics value-redacted', () => {
    const root = createTempRoot()
    const secret = 'sk-test-secret'
    const missingPath = join(root, secret, 'missing-claude')

    try {
      const input = {
        baseEnv: {
          ANTHROPIC_API_KEY: secret,
          MOON_CLAUDE_CODE_EXECUTABLE: missingPath
        },
        searchRoots: [root]
      }
      const diagnostic = createClaudeCodeExecutableDiagnostic(input)

      expect(resolveClaudeCodeExecutablePath(input)).toBeUndefined()
      expect(diagnostic).toContain('checkedEnvKeys=MOON_CLAUDE_CODE_EXECUTABLE')
      expect(diagnostic).not.toContain(secret)
      expect(diagnostic).not.toContain(missingPath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
