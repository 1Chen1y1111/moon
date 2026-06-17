/**
 * 负责生成基础 agent runtime 注入模型的系统提示。
 * 它只拼接 workspace、权限模式和工具约定，不访问具体 provider 或持久化。
 */

import type { AgentRuntimePromptOptions } from './types'

const toolSyntaxBlock = [
  '可用本地工具命令：',
  '- /read <path>：读取当前项目内的文本文件。',
  '- /ls [path]：列出当前项目内的目录。',
  '- /bash <command>：在当前项目目录执行 shell 命令，通常需要用户确认。'
].join('\n')

/**
 * 构造给模型和本地 runtime 共享的系统提示文本。
 */
export function buildAgentRuntimeSystemPrompt({
  permissionMode,
  workspace
}: AgentRuntimePromptOptions): string {
  const workspaceBlock =
    workspace === undefined
      ? '当前对话未绑定项目。本地文件和命令工具不可用。'
      : [`当前项目：${workspace.name ?? '未命名项目'}`, `项目根目录：${workspace.path}`].join('\n')

  return [
    workspaceBlock,
    `权限模式：${permissionMode}`,
    '回答和工具使用必须以当前项目根目录作为 workspace 边界。',
    toolSyntaxBlock
  ].join('\n')
}
