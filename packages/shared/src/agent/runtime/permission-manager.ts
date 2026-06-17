/**
 * 负责基础 agent runtime 的权限判断和 workspace 路径边界校验。
 * 它只做纯规则计算，不执行文件系统或命令副作用。
 */

import { isAbsolute, relative, resolve } from 'node:path'

import type {
  AgentPermissionMode,
  AgentRuntimePermissionDecision,
  AgentRuntimeToolRequest,
  AgentWorkspaceContext
} from './types'

export type AgentPermissionManagerInput = {
  mode?: AgentPermissionMode
  workspace?: AgentWorkspaceContext
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
 * 根据权限模式、工具类型和 workspace 边界判断工具是否可执行。
 */
export class AgentPermissionManager {
  private readonly mode: AgentPermissionMode
  private readonly workspace?: AgentWorkspaceContext

  /**
   * 保存本轮 agent runtime 的权限模式和 workspace 边界。
   */
  constructor({ mode = 'ask', workspace }: AgentPermissionManagerInput = {}) {
    this.mode = mode
    this.workspace = workspace
  }

  /**
   * 评估工具请求是否允许、拒绝或需要人工确认。
   */
  evaluate(request: AgentRuntimeToolRequest): AgentRuntimePermissionDecision {
    if (this.workspace === undefined) {
      return {
        allowed: false,
        description: '当前对话未绑定项目，无法执行本地工具。',
        reason: 'No active project workspace.',
        requiresPermission: false
      }
    }

    const workspaceViolation = this.validateWorkspaceBoundary(request)

    if (workspaceViolation !== null) {
      return workspaceViolation
    }

    if (request.name === 'bash') {
      const command = request.input.command?.trim() ?? ''
      const description = `需要在项目目录执行命令：${command}`

      if (this.mode === 'allow-all') {
        return { allowed: true, description, requiresPermission: false, type: 'bash' }
      }

      return {
        allowed: false,
        description,
        reason: this.mode === 'safe' ? 'Safe mode requires approval for shell commands.' : undefined,
        requiresPermission: true,
        type: 'bash'
      }
    }

    return {
      allowed: true,
      description:
        request.name === 'read_file'
          ? `读取项目文件：${request.input.path ?? ''}`
          : `列出项目目录：${request.input.path ?? '.'}`,
      requiresPermission: false
    }
  }

  /**
   * 校验带路径参数的工具不会越过 workspace 根目录。
   */
  private validateWorkspaceBoundary(
    request: AgentRuntimeToolRequest
  ): AgentRuntimePermissionDecision | null {
    if (request.name === 'bash') {
      return null
    }

    const targetPath = resolveWorkspacePath(this.workspace?.path ?? '', request.input.path)

    if (this.workspace !== undefined && isPathInsideWorkspace(this.workspace.path, targetPath)) {
      return null
    }

    return {
      allowed: false,
      description: '工具路径超出当前项目目录。',
      reason: 'Path is outside the active project workspace.',
      requiresPermission: false
    }
  }
}
