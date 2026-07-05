/**
 * 负责承接 agent backend 的公共生命周期状态。
 * 具体 SDK 调用、事件适配和工具协议由子类实现。
 */

import type { AgentPermissionRequest } from '@moon/core/types'

import type {
  AgentBackend,
  AgentBackendWorkspace,
  AgentBackendMessage,
  AgentChatOptions,
  AgentEvent,
  AgentPermissionDecision,
  AgentSourceActivationCallback,
  MessageAttachment
} from './backend/types'
import { AgentPermissionRuntime } from './backend/agent-permission-runtime'
import { AgentTurnRuntime, type AgentTurnState } from './backend/agent-turn-runtime'
import type { PendingSourceActivationRestart } from './source-activation-drain'
import { AgentSourceRuntime } from './core/agent-source-runtime'
import {
  PermissionManager,
  type AgentToolPermissionCheckResult,
  type ClaudeToolUsePermissionInput
} from './core/permission-manager'
import { AgentPromptRuntime } from './core/agent-prompt-runtime'
import { runAgentPreToolUseRuntime } from './core/pre-tool-use-runtime'
import { PrerequisiteManager } from './core/prerequisite-manager'
import {
  createAgentSessionRuntimeState,
  type AgentSessionRuntimeState
} from './core/session-runtime-state'
import type { AgentSourceRecord } from './core/source-manager'
import type { ThinkingLevel } from '../config'
import type { AgentPermissionMode } from './core/types'

export type BaseAgentInput = {
  agentSessionState?: AgentSessionRuntimeState
  model: string
  permissionMode?: AgentPermissionMode
  sources?: AgentSourceRecord[]
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

/**
 * 提供所有 backend 都需要的模型状态、core modules、运行中标记、取消和权限决策桥接。
 */
export abstract class BaseAgent implements AgentBackend {
  /**
   * 宿主会话注入的 source activation 请求回调；backend 只调用它，不直接激活 source。
   */
  onSourceActivationRequest: AgentSourceActivationCallback | null = null
  protected readonly permissionManager?: PermissionManager
  protected readonly permissionMode?: AgentPermissionMode
  protected readonly prerequisiteManager: PrerequisiteManager
  protected readonly agentSessionState: AgentSessionRuntimeState
  protected readonly sourceRuntime: AgentSourceRuntime
  protected readonly thinkingLevel?: ThinkingLevel
  protected readonly workspace?: AgentBackendWorkspace
  private readonly permissionRuntime: AgentPermissionRuntime
  private readonly promptRuntime: AgentPromptRuntime
  private readonly turnRuntime = new AgentTurnRuntime()
  private model: string

  /**
   * 保存所有 backend 通用的运行时配置。
   */
  constructor({
    agentSessionState,
    model,
    permissionMode,
    sources,
    thinkingLevel,
    workspace
  }: BaseAgentInput) {
    this.agentSessionState = agentSessionState ?? createAgentSessionRuntimeState()
    this.model = model
    this.permissionMode = permissionMode
    this.permissionManager =
      workspace === undefined ? undefined : new PermissionManager({ permissionMode, workspace })
    this.permissionRuntime = new AgentPermissionRuntime({
      agentSessionState: this.agentSessionState
    })
    this.prerequisiteManager = new PrerequisiteManager({
      agentSessionState: this.agentSessionState,
      workspace
    })
    this.sourceRuntime = new AgentSourceRuntime({ sources })
    this.promptRuntime = new AgentPromptRuntime({
      agentSessionState: this.agentSessionState,
      permissionMode,
      sourceRuntime: this.sourceRuntime,
      workspace
    })
    this.thinkingLevel = thinkingLevel
    this.workspace = workspace
  }

  abstract chat(
    message: string,
    attachments?: MessageAttachment[],
    options?: AgentChatOptions
  ): AsyncGenerator<AgentEvent, void, void>

  /**
   * 响应正在等待的权限请求，并把决策交还给发起请求的 SDK hook 或子运行时。
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    this.permissionRuntime.respondToPermission(requestId, allowed, alwaysAllow)
  }

  /**
   * 请求中止当前 turn，并释放基类持有的挂起权限状态。
   */
  async abort(reason?: string): Promise<void> {
    this.turnRuntime.abort(reason)
    this.permissionRuntime.rejectAll(typeof reason === 'string' ? reason : 'Agent aborted.')
  }

  /**
   * 释放 agent 持有的运行时状态，供会话结束或 backend 被替换时调用。
   */
  destroy(): void {
    this.turnRuntime.destroy()
    this.permissionRuntime.rejectAll('Agent destroyed.')
  }

  /**
   * 暴露当前 backend 是否正在处理消息，供会话层判断取消和排队语义。
   */
  isProcessing(): boolean {
    return this.turnRuntime.isProcessing()
  }

  /**
   * 返回当前模型 ID，表示后续 chat 调用默认使用的模型。
   */
  getModel(): string {
    return this.model
  }

  /**
   * 更新当前模型 ID；调用方负责完成模型可用性校验。
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * 启动一次 agent turn，并把外部 abort signal 桥接到本轮内部 AbortController。
   */
  protected startTurn(options: AgentChatOptions = {}): AgentTurnState {
    const turn = this.turnRuntime.start(options)
    this.sourceRuntime.clearActivatedSources()

    return turn
  }

  /**
   * 结束一次 agent turn，清理 abort、事件队列和未决权限请求。
   */
  protected endTurn(turn: AgentTurnState): void {
    this.turnRuntime.end(turn)
    this.permissionRuntime.rejectAll('Agent turn ended.')
  }

  /**
   * 把 backend 内部权限请求转换成统一 agent 事件，并等待宿主应用回传决策。
   */
  protected requestPermission(
    request: AgentPermissionRequest
  ): Promise<AgentPermissionDecision> {
    return this.permissionRuntime.requestPermission({
      eventQueue: this.turnRuntime.eventQueue,
      request,
      turnId: this.turnRuntime.turnId
    })
  }

  /**
   * 构造本轮 provider prompt，并统一注入会话运行态和 source runtime 管理的 context。
   */
  protected buildPrompt(fallbackMessage: string, messages: AgentBackendMessage[]): string {
    return this.promptRuntime.build({ fallbackMessage, messages })
  }

  /**
   * 将运行时已知 source 标记为 active，并在本 turn 记录一次 activation。
   */
  protected markSourceActive(slug: string): boolean {
    return this.sourceRuntime.markSourceActive(slug)
  }

  /**
   * 将运行时已知 source 标记为 inactive，不触发事件或自动重启。
   */
  protected markSourceInactive(slug: string): boolean {
    return this.sourceRuntime.markSourceInactive(slug)
  }

  /**
   * 将运行时已知 source 标记为 needs_auth，不触发鉴权流程。
   */
  protected markSourceNeedsAuth(slug: string, error?: string): boolean {
    return this.sourceRuntime.markSourceNeedsAuth(slug, error)
  }

  /**
   * 将运行时已知 source 标记为 failed，不触发事件或自动重启。
   */
  protected markSourceFailed(slug: string, error?: string): boolean {
    return this.sourceRuntime.markSourceFailed(slug, error)
  }

  /**
   * 消费本 turn 新激活的 source slugs，供后续 backend 决定是否触发更高层流程。
   */
  protected consumeActivatedSources(): string[] {
    return this.sourceRuntime.consumeActivatedSources()
  }

  /**
   * 记录一次等待 drain 后发出的 source activation restart；同一轮内采用 first-writer-wins。
   */
  setPendingSourceActivationRestart(pending: PendingSourceActivationRestart): void {
    this.turnRuntime.setPendingSourceActivationRestart(pending)
  }

  /**
   * 消费并清空 pending source activation restart，供 drain controller 在工具结果边界读取。
   */
  protected consumePendingSourceActivationRestart(): PendingSourceActivationRestart | null {
    return this.turnRuntime.consumePendingSourceActivationRestart()
  }

  /**
   * 将 Claude SDK 工具调用交给 shared core PreToolUse runtime 编排。
   */
  protected checkClaudeToolUse(
    input: ClaudeToolUsePermissionInput
  ): AgentToolPermissionCheckResult {
    return runAgentPreToolUseRuntime({
      agentSessionState: this.agentSessionState,
      input,
      permissionManager: this.permissionManager,
      permissionMode: this.permissionMode,
      prerequisiteManager: this.prerequisiteManager,
      sourceRuntime: this.sourceRuntime
    })
  }

}
