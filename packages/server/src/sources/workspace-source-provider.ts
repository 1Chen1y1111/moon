/**
 * 负责把当前会话绑定的项目元数据转换成 agent 可见的 workspace source。
 * 本文件只读取项目根目录的 AGENTS.md，不负责 source 持久化或鉴权。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  SessionSourceProvider,
  SessionSourceProviderScope
} from '@moon/server-core/sessions'
import type { AgentSourceRecord } from '@moon/shared/agent'

const agentsFileName = 'AGENTS.md'
const maxWorkspaceInstructionsCharacters = 20_000

/**
 * 判断读取失败是否只是项目没有提供 AGENTS.md；这种情况不应污染 source 状态。
 */
function isMissingAgentsFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

/**
 * 限制注入 prompt 的项目说明长度，避免异常大的 AGENTS.md 占满上下文。
 */
function limitInstructions(instructions: string): string {
  if (instructions.length <= maxWorkspaceInstructionsCharacters) {
    return instructions
  }

  return [
    instructions.slice(0, maxWorkspaceInstructionsCharacters),
    '',
    `[Truncated to first ${maxWorkspaceInstructionsCharacters} characters.]`
  ].join('\n')
}

/**
 * 构造包含文件路径的读取错误，避免不同平台的 Node 错误消息丢失目标文件。
 */
function createReadErrorMessage(guidePath: string, error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error)

  return `Failed to read ${guidePath}: ${errorMessage}`
}

/**
 * 基于项目元数据提供当前 workspace source，作为 SessionSourceProvider 的本地默认实现。
 */
export class WorkspaceSourceProvider implements SessionSourceProvider {
  /**
   * 根据会话作用域派生 sources；未绑定项目的会话不注入 source context。
   */
  async resolveSources(scope: SessionSourceProviderScope): Promise<AgentSourceRecord[]> {
    if (scope.project === null) {
      return []
    }

    const guidePath = join(scope.project.path, agentsFileName)
    const source: AgentSourceRecord = {
      slug: 'workspace',
      name: scope.project.name,
      description: `Workspace at ${scope.project.path}`,
      status: 'active'
    }

    try {
      const instructions = await readFile(guidePath, 'utf8')

      return [
        {
          ...source,
          guidePath,
          instructions: limitInstructions(instructions)
        }
      ]
    } catch (error) {
      if (isMissingAgentsFile(error)) {
        return [source]
      }

      return [
        {
          ...source,
          guidePath,
          error: createReadErrorMessage(guidePath, error)
        }
      ]
    }
  }
}
