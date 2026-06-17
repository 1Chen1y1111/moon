/**
 * 负责定义 Moon 基础 agent runtime 的纯类型边界。
 * 这些类型只描述工具、权限和 workspace 语义，不绑定具体执行环境。
 */

export type AgentPermissionMode = 'safe' | 'ask' | 'allow-all'

export type AgentRuntimeToolName = 'read_file' | 'list_dir' | 'bash'

export type AgentWorkspaceContext = {
  name?: string
  path: string
}

export type AgentRuntimeToolInput = {
  command?: string
  path?: string
}

export type AgentRuntimeToolRequest = {
  id: string
  name: AgentRuntimeToolName
  input: AgentRuntimeToolInput
}

export type AgentRuntimePermissionDecision = {
  allowed: boolean
  description: string
  reason?: string
  requiresPermission: boolean
  type?: 'bash'
}

export type AgentRuntimePromptOptions = {
  permissionMode: AgentPermissionMode
  workspace?: AgentWorkspaceContext
}
