/**
 * 负责 agent backend 运行时共享的工具权限规则和 workspace 路径边界校验。
 * 它只做纯规则判断，不执行文件系统、命令或 SDK 副作用。
 */

import type { AgentPermissionRequest } from '@moon/core/types'
import { isAbsolute, relative, resolve } from 'node:path'

import type { AgentPermissionMode, AgentWorkspaceContext } from './types'

const claudeReadOnlyTools = new Set(['Read', 'Glob', 'Grep', 'LS'])
const claudeWritableTools = new Set(['Write', 'Edit', 'MultiEdit'])

export type AgentToolPermissionCheckResult =
  | { type: 'allow' }
  | { type: 'block'; reason: string }
  | { type: 'prompt'; request: AgentPermissionRequest }
  | { type: 'source_activation_needed'; sourceSlug: string; sourceExists: boolean }

export type ClaudeToolUsePermissionInput = {
  toolName: string
  toolUseId: string
  toolInput?: Record<string, unknown>
}

export type PermissionManagerInput = {
  permissionMode?: AgentPermissionMode
  workspace: AgentWorkspaceContext
}

/**
 * 从工具输入中读取非空字符串字段。
 */
function readStringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]

  return typeof field === 'string' && field.trim().length > 0 ? field : undefined
}

/**
 * 解析 Claude 工具输入里可能代表路径的字段。
 */
function resolveToolInputPath(input: Record<string, unknown>): string | undefined {
  return (
    readStringField(input, 'file_path') ??
    readStringField(input, 'path') ??
    readStringField(input, 'directory')
  )
}

/**
 * 解析 Bash 工具输入里的命令文本。
 */
function resolveBashCommand(input: Record<string, unknown>): string | undefined {
  return readStringField(input, 'command')
}

/**
 * 解析写文件工具输入中的目标文件路径。
 */
function resolveWritableToolPath(input: Record<string, unknown>): string | undefined {
  return readStringField(input, 'file_path')
}

/**
 * 把 Claude Code 写文件工具输入转换成 Moon 统一权限请求。
 */
function createWritableToolPermissionRequest(
  toolName: string,
  toolUseId: string,
  input: Record<string, unknown>
): AgentPermissionRequest {
  const path = resolveWritableToolPath(input)

  return {
    requestId: `perm-${toolUseId}`,
    toolName,
    description: `需要修改项目文件：${path ?? ''}`,
    ...(path === undefined ? {} : { path }),
    type: 'file_write',
    impact: '写操作会改变当前项目工作区文件。'
  }
}

/**
 * 将工具传入路径解析到 workspace 内的绝对路径。
 */
export function resolveWorkspacePath(workspacePath: string, inputPath = '.'): string {
  const normalizedInputPath = inputPath.trim() || '.'

  return isAbsolute(normalizedInputPath)
    ? resolve(normalizedInputPath)
    : resolve(workspacePath, normalizedInputPath)
}

/**
 * 判断目标路径是否仍位于 workspace 根目录内。
 */
export function isPathInsideWorkspace(workspacePath: string, targetPath: string): boolean {
  const relativePath = relative(resolve(workspacePath), resolve(targetPath))

  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

/**
 * 判断 Claude Code SDK 工具输入是否仍位于当前 Moon workspace 内。
 */
export function isClaudeToolInputInsideWorkspace(
  workspace: AgentWorkspaceContext,
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
 * 集中管理 agent 工具权限规则，作为 SDK adapter 和未来 backend 复用的判断边界。
 */
export class PermissionManager {
  private readonly permissionMode: AgentPermissionMode
  private readonly workspace: AgentWorkspaceContext

  /**
   * 保存权限判断所需的 workspace 边界和默认权限模式。
   */
  constructor({ permissionMode = 'ask', workspace }: PermissionManagerInput) {
    this.permissionMode = permissionMode
    this.workspace = workspace
  }

  /**
   * 检查 Claude Code SDK PreToolUse 请求，返回 allow/block/prompt 三态结果。
   */
  checkClaudeToolUse({
    toolInput = {},
    toolName,
    toolUseId
  }: ClaudeToolUsePermissionInput): AgentToolPermissionCheckResult {
    if (toolName === 'Bash') {
      const command = resolveBashCommand(toolInput)

      return {
        type: 'prompt',
        request: {
          requestId: `perm-${toolUseId}`,
          toolName,
          description: `需要在项目目录执行命令：${command ?? ''}`,
          ...(command === undefined ? {} : { command }),
          type: 'bash'
        }
      }
    }

    if (claudeWritableTools.has(toolName)) {
      if (!isClaudeToolInputInsideWorkspace(this.workspace, toolInput)) {
        return {
          type: 'block',
          reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
        }
      }

      if (this.permissionMode === 'allow-all') {
        return { type: 'allow' }
      }

      if (this.permissionMode === 'safe') {
        return {
          type: 'block',
          reason: '安全模式禁止 Claude Code SDK 修改项目文件。'
        }
      }

      return {
        type: 'prompt',
        request: createWritableToolPermissionRequest(toolName, toolUseId, toolInput)
      }
    }

    if (!claudeReadOnlyTools.has(toolName)) {
      return {
        type: 'block',
        reason: `Moon 当前阶段只允许 Claude Code SDK 只读工具、Bash 和文件写入审批，已阻止 ${toolName}。`
      }
    }

    if (!isClaudeToolInputInsideWorkspace(this.workspace, toolInput)) {
      return {
        type: 'block',
        reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
      }
    }

    return { type: 'allow' }
  }
}
