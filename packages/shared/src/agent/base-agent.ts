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
import { EventQueue } from './backend/event-queue'
import { AgentPermissionRequestQueue } from './backend/permission-request-queue'
import type { PendingSourceActivationRestart } from './source-activation-drain'
import {
  PermissionManager,
  type AgentToolPermissionCheckResult,
  type ClaudeToolUsePermissionInput
} from './core/permission-manager'
import { runAgentPreToolUseRuntime } from './core/pre-tool-use-runtime'
import { PrerequisiteManager } from './core/prerequisite-manager'
import { buildSessionContextBlock, PromptBuilder } from './core/prompt-builder'
import {
  addPermissionGrantFromRequest,
  createAgentSessionRuntimeState,
  type AgentSessionRuntimeState
} from './core/session-runtime-state'
import { SourceManager, type AgentSourceRecord } from './core/source-manager'
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

type AgentTurnState = {
  abortController: AbortController
  eventQueue: EventQueue
  cleanupExternalAbort: () => void
  turnId: string | null
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
  protected readonly promptBuilder: PromptBuilder
  protected readonly agentSessionState: AgentSessionRuntimeState
  protected readonly sourceManager: SourceManager
  protected readonly thinkingLevel?: ThinkingLevel
  protected readonly workspace?: AgentBackendWorkspace
  private readonly permissionRequestQueue = new AgentPermissionRequestQueue()
  private abortController: AbortController | null = null
  private currentTurnId: string | null = null
  private eventQueue: EventQueue | null = null
  private model: string
  private pendingSourceActivationRestart: PendingSourceActivationRestart | null = null
  private processing = false

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
    this.prerequisiteManager = new PrerequisiteManager({
      agentSessionState: this.agentSessionState,
      workspace
    })
    this.promptBuilder = new PromptBuilder()
    this.sourceManager = new SourceManager({ sources })
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
    const response = this.permissionRequestQueue.respond(requestId, allowed, alwaysAllow)

    if (response === null) {
      return
    }

    if (response.decision.approved && response.decision.alwaysAllow === true) {
      addPermissionGrantFromRequest(this.agentSessionState, response.request)
    }
  }

  /**
   * 请求中止当前 turn，并释放基类持有的挂起权限状态。
   */
  async abort(reason?: string): Promise<void> {
    this.abortController?.abort(reason)
    this.eventQueue?.complete()
    this.rejectPendingPermissions(typeof reason === 'string' ? reason : 'Agent aborted.')
    this.clearTurnState()
  }

  /**
   * 释放 agent 持有的运行时状态，供会话结束或 backend 被替换时调用。
   */
  destroy(): void {
    this.abortController?.abort('destroyed')
    this.eventQueue?.complete()
    this.rejectPendingPermissions('Agent destroyed.')
    this.clearTurnState()
  }

  /**
   * 暴露当前 backend 是否正在处理消息，供会话层判断取消和排队语义。
   */
  isProcessing(): boolean {
    return this.processing
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
    const abortController = new AbortController()
    const eventQueue = new EventQueue()
    const turnId = options.turnId ?? null
    const relayAbort = (): void => abortController.abort(options.abortSignal?.reason)

    this.abortController = abortController
    this.currentTurnId = turnId
    this.eventQueue = eventQueue
    this.processing = true
    this.pendingSourceActivationRestart = null
    this.sourceManager.clearActivatedSources()

    if (options.abortSignal?.aborted) {
      relayAbort()
    } else {
      options.abortSignal?.addEventListener('abort', relayAbort, { once: true })
    }

    return {
      abortController,
      turnId,
      eventQueue,
      cleanupExternalAbort: () => options.abortSignal?.removeEventListener('abort', relayAbort)
    }
  }

  /**
   * 结束一次 agent turn，清理 abort、事件队列和未决权限请求。
   */
  protected endTurn(turn: AgentTurnState): void {
    turn.cleanupExternalAbort()
    turn.eventQueue.complete()

    if (this.abortController === turn.abortController) {
      this.abortController = null
    }

    if (this.eventQueue === turn.eventQueue) {
      this.eventQueue = null
    }

    if (this.currentTurnId === turn.turnId) {
      this.currentTurnId = null
    }

    this.rejectPendingPermissions('Agent turn ended.')
    this.pendingSourceActivationRestart = null
    this.processing = false
  }

  /**
   * 把 backend 内部权限请求转换成统一 agent 事件，并等待宿主应用回传决策。
   */
  protected requestPermission(
    request: AgentPermissionRequest
  ): Promise<AgentPermissionDecision> {
    const eventQueue = this.eventQueue

    if (eventQueue === null) {
      return Promise.resolve({
        requestId: request.requestId,
        approved: false,
        reason: 'No active agent event queue.'
      })
    }

    const decisionPromise = this.permissionRequestQueue.create(request)

    eventQueue.enqueue({
      type: 'permission_request',
      request,
      ...(this.currentTurnId === null ? {} : { turnId: this.currentTurnId })
    })

    return decisionPromise
  }

  /**
   * 构造本轮 provider prompt，并统一注入会话运行态和 SourceManager 管理的 source context。
   */
  protected buildPrompt(fallbackMessage: string, messages: AgentBackendMessage[]): string {
    return this.promptBuilder.build({
      fallbackMessage,
      messages,
      sessionContextBlock: buildSessionContextBlock({
        agentSessionState: this.agentSessionState,
        permissionMode: this.permissionMode,
        workspace: this.workspace
      }),
      sourceContextBlock: this.sourceManager.buildContextBlock(),
      workspace: this.workspace
    })
  }

  /**
   * 将运行时已知 source 标记为 active，并在本 turn 记录一次 activation。
   */
  protected markSourceActive(slug: string): boolean {
    return this.sourceManager.markSourceActive(slug)
  }

  /**
   * 将运行时已知 source 标记为 inactive，不触发事件或自动重启。
   */
  protected markSourceInactive(slug: string): boolean {
    return this.sourceManager.markSourceInactive(slug)
  }

  /**
   * 将运行时已知 source 标记为 needs_auth，不触发鉴权流程。
   */
  protected markSourceNeedsAuth(slug: string, error?: string): boolean {
    return this.sourceManager.markSourceNeedsAuth(slug, error)
  }

  /**
   * 将运行时已知 source 标记为 failed，不触发事件或自动重启。
   */
  protected markSourceFailed(slug: string, error?: string): boolean {
    return this.sourceManager.markSourceFailed(slug, error)
  }

  /**
   * 消费本 turn 新激活的 source slugs，供后续 backend 决定是否触发更高层流程。
   */
  protected consumeActivatedSources(): string[] {
    return this.sourceManager.consumeActivatedSources()
  }

  /**
   * 记录一次等待 drain 后发出的 source activation restart；同一轮内采用 first-writer-wins。
   */
  setPendingSourceActivationRestart(pending: PendingSourceActivationRestart): void {
    if (this.pendingSourceActivationRestart !== null) {
      return
    }

    this.pendingSourceActivationRestart = pending
  }

  /**
   * 消费并清空 pending source activation restart，供 drain controller 在工具结果边界读取。
   */
  protected consumePendingSourceActivationRestart(): PendingSourceActivationRestart | null {
    const pending = this.pendingSourceActivationRestart

    this.pendingSourceActivationRestart = null

    return pending
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
      sourceManager: this.sourceManager
    })
  }

  /**
   * 拒绝并释放所有未决权限请求，避免 SDK hook 在取消或销毁后继续等待。
   */
  private rejectPendingPermissions(reason: string): void {
    this.permissionRequestQueue.rejectAll(reason)
  }

  /**
   * 清空当前 turn 引用和运行中标记。
   */
  private clearTurnState(): void {
    this.abortController = null
    this.currentTurnId = null
    this.eventQueue = null
    this.pendingSourceActivationRestart = null
    this.processing = false
  }
}
