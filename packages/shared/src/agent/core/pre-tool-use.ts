/**
 * 负责 Moon 版 Claude-first PreToolUse 小型管线。
 * 本文件只做 provider 无关的权限决策，不执行 SDK hook、UI 请求或工具输入改写。
 */

import type { AgentPermissionRequest } from '@moon/core/types'
import { isAbsolute, relative, resolve } from 'node:path'

import type { AgentPermissionGrant } from './session-runtime-state'
import { hasPermissionGrant } from './session-runtime-state'
import type { AgentPermissionMode, AgentWorkspaceContext } from './types'

const claudeReadOnlyTools = new Set(['Read', 'Glob', 'Grep', 'LS'])
const claudeWritableTools = new Set(['Write', 'Edit', 'MultiEdit'])
const claudeReadOnlyPathFields = new Map([
  ['Read', 'file_path'],
  ['Glob', 'path'],
  ['Grep', 'path'],
  ['LS', 'directory']
])

export type PreToolUseSourceActivation = {
  sourceSlug: string
  sourceExists: boolean
}

export type PreToolUseSourceTool = {
  sourceSlug: string
  sourceExists: boolean
}

export type PreToolUsePrerequisite = {
  type: 'block'
  reason: string
}

export type PreToolUseCheckResult =
  | { type: 'allow' }
  | { type: 'block'; reason: string }
  | { type: 'prompt'; request: AgentPermissionRequest }
  | { type: 'source_activation_needed'; sourceSlug: string; sourceExists: boolean }
  | { type: 'modify'; toolInput: Record<string, unknown> }

export type AgentToolPermissionCheckResult = PreToolUseCheckResult

export type ClaudeToolUsePermissionInput = {
  toolName: string
  toolUseId: string
  toolInput?: Record<string, unknown>
}

export type PreToolUseCheckInput = ClaudeToolUsePermissionInput & {
  permissionMode?: AgentPermissionMode
  permissionGrants?: readonly AgentPermissionGrant[]
  prerequisite?: PreToolUsePrerequisite | null
  sourceActivation?: PreToolUseSourceActivation | null
  sourceTool?: PreToolUseSourceTool | null
  workspace?: AgentWorkspaceContext
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
 * 读取只读工具当前阶段允许规整的路径字段名。
 */
function resolveReadOnlyToolPathField(toolName: string): string | undefined {
  return claudeReadOnlyPathFields.get(toolName)
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
 * 把 Claude Code Bash 工具输入转换成 Moon 统一权限请求。
 */
function createBashToolPermissionRequest(
  toolName: string,
  toolUseId: string,
  input: Record<string, unknown>
): AgentPermissionRequest {
  const command = resolveBashCommand(input)

  return {
    requestId: `perm-${toolUseId}`,
    toolName,
    description: `需要在项目目录执行命令：${command ?? ''}`,
    ...(command === undefined ? {} : { command }),
    type: 'bash'
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
 * 判断工具输入路径是否越出 workspace；无路径工具默认视为不越界。
 */
function hasWorkspaceBoundaryViolation(
  workspace: AgentWorkspaceContext,
  toolInput: Record<string, unknown>
): boolean {
  return !isClaudeToolInputInsideWorkspace(workspace, toolInput)
}

/**
 * 对只读工具的 workspace-relative 路径做最小规整；无变化时返回 null。
 */
function normalizeReadOnlyToolInputPath(
  toolName: string,
  toolInput: Record<string, unknown>,
  workspace: AgentWorkspaceContext
): Record<string, unknown> | null {
  const pathField = resolveReadOnlyToolPathField(toolName)

  if (pathField === undefined) {
    return null
  }

  const inputPath = readStringField(toolInput, pathField)

  if (inputPath === undefined) {
    return null
  }

  const trimmedInputPath = inputPath.trim()

  if (isAbsolute(trimmedInputPath)) {
    return null
  }

  const targetPath = resolveWorkspacePath(workspace.path, trimmedInputPath)
  const normalizedPath = relative(resolve(workspace.path), targetPath) || '.'

  if (normalizedPath === inputPath) {
    return null
  }

  return {
    ...toolInput,
    [pathField]: normalizedPath
  }
}

/**
 * 执行 Moon Claude-first PreToolUse 管线，统一返回 allow/block/prompt/source activation 等结果。
 */
export function runPreToolUseChecks({
  permissionMode = 'ask',
  permissionGrants = [],
  prerequisite,
  sourceActivation,
  sourceTool,
  toolInput = {},
  toolName,
  toolUseId,
  workspace
}: PreToolUseCheckInput): PreToolUseCheckResult {
  if (sourceActivation !== undefined && sourceActivation !== null) {
    return {
      type: 'source_activation_needed',
      sourceSlug: sourceActivation.sourceSlug,
      sourceExists: sourceActivation.sourceExists
    }
  }

  if (prerequisite !== undefined && prerequisite !== null) {
    return {
      type: 'block',
      reason: prerequisite.reason
    }
  }

  if (sourceTool !== undefined && sourceTool !== null) {
    return {
      type: 'block',
      reason: `Moon 已识别 source "${sourceTool.sourceSlug}" 的工具 ${toolName}，但当前阶段尚未接入 source tool execution，已阻止该工具调用。`
    }
  }

  if (workspace === undefined) {
    return {
      type: 'block',
      reason: 'No active workspace is available for Claude Code tool permissions.'
    }
  }

  if (toolName === 'Bash') {
    const request = createBashToolPermissionRequest(toolName, toolUseId, toolInput)

    if (hasPermissionGrant(permissionGrants, request)) {
      return { type: 'allow' }
    }

    return {
      type: 'prompt',
      request
    }
  }

  if (claudeWritableTools.has(toolName)) {
    if (hasWorkspaceBoundaryViolation(workspace, toolInput)) {
      return {
        type: 'block',
        reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
      }
    }

    if (permissionMode === 'allow-all') {
      return { type: 'allow' }
    }

    if (permissionMode === 'safe') {
      return {
        type: 'block',
        reason: '安全模式禁止 Claude Code SDK 修改项目文件。'
      }
    }

    const request = createWritableToolPermissionRequest(toolName, toolUseId, toolInput)

    if (hasPermissionGrant(permissionGrants, request)) {
      return { type: 'allow' }
    }

    return {
      type: 'prompt',
      request
    }
  }

  if (!claudeReadOnlyTools.has(toolName)) {
    return {
      type: 'block',
      reason: `Moon 当前阶段只允许 Claude Code SDK 只读工具、Bash 和文件写入审批，已阻止 ${toolName}。`
    }
  }

  if (hasWorkspaceBoundaryViolation(workspace, toolInput)) {
    return {
      type: 'block',
      reason: '工具路径超出当前项目 workspace，已被 Moon 阻止。'
    }
  }

  const modifiedToolInput = normalizeReadOnlyToolInputPath(toolName, toolInput, workspace)

  if (modifiedToolInput !== null) {
    return {
      type: 'modify',
      toolInput: modifiedToolInput
    }
  }

  return { type: 'allow' }
}
