/**
 * 负责定义 Moon agent backend 的统一调用合同。
 * backend 实现必须输出 @moon/core 的归一化事件，不能让 SDK 私有 payload 穿透边界。
 */

import type {
  AgentEvent as CoreAgentEvent,
  MessageAttachment as CoreMessageAttachment
} from '@moon/core/types'
import type { AgentBackendProvider, CustomEndpointApi, ThinkingLevel } from '../../config'

export type { AgentEvent, AgentPermissionDecision, MessageAttachment } from '@moon/core/types'

export type AgentChatOptions = {
  isRetry?: boolean
  thinkingOverride?: ThinkingLevel
  abortSignal?: AbortSignal
}

export type AgentBackendMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AgentBackendWorkspace = {
  name?: string
  path: string
}

export type AgentBackendConfig = {
  provider: AgentBackendProvider
  model: string
  apiKey?: string
  baseUrl?: string
  customEndpoint?: {
    api: CustomEndpointApi
  }
  messages?: AgentBackendMessage[]
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

export interface AgentBackend {
  /**
   * 发送一条用户消息并返回统一事件流，调用方负责把事件映射到会话状态和持久化结构。
   */
  chat(
    message: string,
    attachments?: CoreMessageAttachment[],
    options?: AgentChatOptions
  ): AsyncGenerator<CoreAgentEvent, void, void>

  /**
   * 响应一个等待中的权限请求，backend 负责把该决策转交给 SDK、子进程或内部挂起流程。
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void

  /**
   * 请求中止当前执行，具体 backend 决定是软中断、硬中断还是转发给子进程。
   */
  abort(reason?: string): Promise<void>

  /**
   * 释放 backend 持有的 watcher、子进程、SDK 会话或其他运行时资源。
   */
  destroy(): void

  /**
   * 暴露当前 backend 是否正在处理消息，供会话层决定排队、取消或拒绝新输入。
   */
  isProcessing(): boolean

  /**
   * 返回当前模型 ID，表示后续 chat 调用默认使用的模型。
   */
  getModel(): string

  /**
   * 更新当前模型 ID；调用方负责在 UI 或配置层完成模型可用性校验。
   */
  setModel(model: string): void
}
