/**
 * 负责定义 agent backend 运行时共享的权限和 workspace 类型边界。
 * 这些类型不描述 Moon 本地工具协议，具体执行语义由目标 backend 决定。
 */

export type AgentPermissionMode = 'safe' | 'ask' | 'allow-all'

export type AgentWorkspaceContext = {
  name?: string
  path: string
}
