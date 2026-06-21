/**
 * 负责承接 agent backend 的公共生命周期状态。
 * 具体 SDK 调用、事件适配和工具协议由子类实现。
 */

import type { AgentPermissionRequest } from '@moon/core/types'

import type {
  AgentBackend,
  AgentBackendWorkspace,
  AgentChatOptions,
  AgentEvent,
  AgentPermissionDecision,
  MessageAttachment
} from './backend/types'
import { SourceManager } from './runtime/source-manager'
import type { ThinkingLevel } from '../config'
import type { AgentPermissionMode } from './runtime/types'

export type BaseAgentInput = {
  model: string
  permissionMode?: AgentPermissionMode
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

export type AgentEventQueuePort = {
  push: (event: AgentEvent) => void
  next: () => Promise<AgentEvent>
}

export type BaseAgentTurnContext = {
  abortController: AbortController
  eventQueue: AgentEventQueuePort
  cleanupExternalAbort: () => void
}

type PendingAgentPermission = {
  resolve: (decision: AgentPermissionDecision) => void
}

/**
 * 在 SDK hook 或子运行时事件需要插队时，提供一个轻量事件队列。
 */
class AgentEventQueue implements AgentEventQueuePort {
  private readonly events: AgentEvent[] = []
  private readonly waiters: Array<(event: AgentEvent) => void> = []

  /**
   * 推入一个需要优先交给会话编排层处理的 agent 事件。
   */
  push(event: AgentEvent): void {
    const waiter = this.waiters.shift()

    if (waiter !== undefined) {
      waiter(event)
      return
    }

    this.events.push(event)
  }

  /**
   * 读取下一条已排队事件；没有事件时等待后续事件推入。
   */
  next(): Promise<AgentEvent> {
    const event = this.events.shift()

    if (event !== undefined) {
      return Promise.resolve(event)
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }
}

/**
 * 提供所有 backend 都需要的模型状态、运行中标记、取消和权限决策桥接。
 */
export abstract class BaseAgent implements AgentBackend {
  protected readonly permissionMode?: AgentPermissionMode
  protected readonly sourceManager = new SourceManager()
  protected readonly thinkingLevel?: ThinkingLevel
  protected readonly workspace?: AgentBackendWorkspace
  private readonly pendingPermissions = new Map<string, PendingAgentPermission>()
  private abortController: AbortController | null = null
  private eventQueue: AgentEventQueuePort | null = null
  private model: string
  private processing = false

  /**
   * 保存所有 backend 通用的运行时配置。
   */
  constructor({ model, permissionMode, thinkingLevel, workspace }: BaseAgentInput) {
    this.model = model
    this.permissionMode = permissionMode
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
    const pendingPermission = this.pendingPermissions.get(requestId)

    if (pendingPermission === undefined) {
      return
    }

    this.pendingPermissions.delete(requestId)
    pendingPermission.resolve(
      allowed
        ? { requestId, approved: true, ...(alwaysAllow ? { alwaysAllow } : {}) }
        : { requestId, approved: false }
    )
  }

  /**
   * 请求中止当前 turn，并释放基类持有的挂起权限状态。
   */
  async abort(reason?: string): Promise<void> {
    this.abortController?.abort(reason)
    this.rejectPendingPermissions(typeof reason === 'string' ? reason : 'Agent aborted.')
    this.clearTurnState()
  }

  /**
   * 释放 agent 持有的运行时状态，供会话结束或 backend 被替换时调用。
   */
  destroy(): void {
    this.abortController?.abort('destroyed')
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
  protected beginTurn(options: AgentChatOptions = {}): BaseAgentTurnContext {
    const abortController = new AbortController()
    const eventQueue = new AgentEventQueue()
    const relayAbort = (): void => abortController.abort(options.abortSignal?.reason)

    this.abortController = abortController
    this.eventQueue = eventQueue
    this.processing = true

    if (options.abortSignal?.aborted) {
      relayAbort()
    } else {
      options.abortSignal?.addEventListener('abort', relayAbort, { once: true })
    }

    return {
      abortController,
      eventQueue,
      cleanupExternalAbort: () => options.abortSignal?.removeEventListener('abort', relayAbort)
    }
  }

  /**
   * 结束一次 agent turn，清理 abort、事件队列和未决权限请求。
   */
  protected endTurn(turn: BaseAgentTurnContext): void {
    turn.cleanupExternalAbort()

    if (this.abortController === turn.abortController) {
      this.abortController = null
    }

    if (this.eventQueue === turn.eventQueue) {
      this.eventQueue = null
    }

    this.rejectPendingPermissions('Agent turn ended.')
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

    const decisionPromise = new Promise<AgentPermissionDecision>((resolve) => {
      this.pendingPermissions.set(request.requestId, { resolve })
    })

    eventQueue.push({ type: 'permission_request', request })

    return decisionPromise
  }

  /**
   * 拒绝并释放所有未决权限请求，避免 SDK hook 在取消或销毁后继续等待。
   */
  private rejectPendingPermissions(reason: string): void {
    for (const [requestId, pendingPermission] of this.pendingPermissions) {
      pendingPermission.resolve({ requestId, approved: false, reason })
    }

    this.pendingPermissions.clear()
  }

  /**
   * 清空当前 turn 引用和运行中标记。
   */
  private clearTurnState(): void {
    this.abortController = null
    this.eventQueue = null
    this.processing = false
  }
}
