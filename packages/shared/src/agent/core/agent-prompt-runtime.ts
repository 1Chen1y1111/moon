/**
 * 负责 agent 单轮 provider prompt 的运行时上下文编排。
 * 它只组合会话状态、source context 和 PromptBuilder，不负责 SDK options 或权限判断。
 */

import type { AgentBackendMessage, AgentBackendWorkspace } from '../backend/types'
import type { AgentSourceRuntime } from './agent-source-runtime'
import { buildSessionContextBlock, PromptBuilder } from './prompt-builder'
import type { AgentSessionRuntimeState } from './session-runtime-state'
import type { AgentPermissionMode } from './types'

export type AgentPromptRuntimeInput = {
  agentSessionState: AgentSessionRuntimeState
  permissionMode?: AgentPermissionMode
  sourceRuntime: AgentSourceRuntime
  workspace?: AgentBackendWorkspace
}

export type AgentPromptRuntimeBuildInput = {
  fallbackMessage: string
  messages: AgentBackendMessage[]
}

/**
 * 将 BaseAgent 持有的 session/source 运行态转换成 provider prompt。
 */
export class AgentPromptRuntime {
  private readonly agentSessionState: AgentSessionRuntimeState
  private readonly permissionMode?: AgentPermissionMode
  private readonly promptBuilder = new PromptBuilder()
  private readonly sourceRuntime: AgentSourceRuntime
  private readonly workspace?: AgentBackendWorkspace

  /**
   * 保存 prompt 编排所需的会话状态、source runtime 和 workspace 上下文。
   */
  constructor({
    agentSessionState,
    permissionMode,
    sourceRuntime,
    workspace
  }: AgentPromptRuntimeInput) {
    this.agentSessionState = agentSessionState
    this.permissionMode = permissionMode
    this.sourceRuntime = sourceRuntime
    this.workspace = workspace
  }

  /**
   * 构造本轮 provider prompt，并按 session state、sources、消息正文的固定顺序拼接。
   */
  build({ fallbackMessage, messages }: AgentPromptRuntimeBuildInput): string {
    return this.promptBuilder.build({
      fallbackMessage,
      messages,
      sessionContextBlock: buildSessionContextBlock({
        agentSessionState: this.agentSessionState,
        permissionMode: this.permissionMode,
        workspace: this.workspace
      }),
      sourceContextBlock: this.sourceRuntime.buildContextBlock(),
      workspace: this.workspace
    })
  }
}
