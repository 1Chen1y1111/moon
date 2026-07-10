/**
 * 负责会话层创建 agent backend 前后的运行时上下文组装。
 * 它管理 thread 级 agent session state、provider fork、source/权限解析和 backend 回调注入。
 */

import {
  addActivatedSourceSlug,
  clearProviderSessionId as clearAgentProviderSessionId,
  createConnectionAgentBackendConfig,
  createAgentSessionRuntimeState,
  hasActivatedSourceSlug,
  setProviderSessionId,
  type AgentBackend,
  type AgentBackendConfig,
  type AgentBackendMessage,
  type AgentBackendWorkspace,
  type AgentPermissionMode,
  type AgentProviderSessionFork,
  type AgentSessionRuntimeState,
  type AgentSourceRecord
} from '@moon/shared/agent'
import type { NormalizedLlmConnection } from '@moon/shared/config'
import type { SessionRecord, ThreadRecord, TopicRecord } from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import { SessionScopedToolCallbackRegistry } from './session-scoped-tool-callback-registry'

const defaultAgentPermissionMode = 'ask' satisfies AgentPermissionMode

/**
 * Source provider 解析 sources 时可见的会话作用域，保持在 server-core 纯 runtime 边界内。
 */
export type SessionSourceProviderScope = {
  project: ProjectRecord | null
  session: SessionRecord
  topic: TopicRecord
  thread: ThreadRecord
}

/**
 * 为当前会话 turn 提供 agent sources，具体来源由 Electron main 或未来 runtime 注入。
 */
export type SessionSourceProvider = {
  resolveSources: (scope: SessionSourceProviderScope) => Promise<AgentSourceRecord[]>
}

/**
 * 为当前会话 turn 解析 agent 权限模式，具体来源可由 Electron main 或未来 runtime 注入。
 */
export type SessionPermissionModeResolver = {
  resolvePermissionMode: (
    scope: SessionSourceProviderScope
  ) => AgentPermissionMode | Promise<AgentPermissionMode>
}

/**
 * 激活当前会话 turn 需要的 source；当前只表达 runtime 边界，不实现具体连接协议。
 */
export type SessionSourceActivator = {
  activateSource: (scope: SessionSourceProviderScope, sourceSlug: string) => Promise<boolean>
}

/**
 * 为单次 operation 创建独立 backend，实例生命周期由 operation runtime 负责结束。
 */
export type AgentBackendFactory = (config: AgentBackendConfig) => AgentBackend

export type SessionAgentRuntimeInput = {
  createAgentBackend: AgentBackendFactory
  permissionModeResolver?: SessionPermissionModeResolver
  sourceActivator?: SessionSourceActivator
  sourceProvider?: SessionSourceProvider
}

export type SessionAgentRuntimeCreateBackendInput = {
  connection: NormalizedLlmConnection
  messages: AgentBackendMessage[]
  originalMessage: string
  scope: SessionSourceProviderScope
  workspace?: AgentBackendWorkspace
}

export type SessionAgentRuntimeCreateBackendResult = {
  agentBackend: AgentBackend
  agentSessionState: AgentSessionRuntimeState
}

/**
 * 将当前 thread session 记住的 source activation 应用到 provider 返回的 source 列表。
 * 这里不创建未知 source，只把已知 slug 标记为 active，避免提前引入完整 MCP source registry。
 */
function applySessionActivatedSources(
  sources: AgentSourceRecord[],
  agentSessionState: AgentSessionRuntimeState
): AgentSourceRecord[] {
  if (agentSessionState.activatedSourceSlugs.length === 0) {
    return sources
  }

  return sources.map((source) => {
    if (!hasActivatedSourceSlug(agentSessionState.activatedSourceSlugs, source.slug)) {
      return source
    }

    const activatedSource: AgentSourceRecord = {
      ...source,
      status: 'active'
    }

    delete activatedSource.error

    return activatedSource
  })
}

/**
 * 用 thread metadata 中持久化的 provider session 初始化新 runtime state。
 * 已有内存值优先，避免旧 metadata 覆盖本进程刚收到的 session id。
 */
function hydrateProviderSessionId(
  agentSessionState: AgentSessionRuntimeState,
  thread: ThreadRecord
): void {
  if (agentSessionState.providerSessionId !== undefined) {
    return
  }

  const providerSessionId = thread.metadata?.providerSessionId

  if (typeof providerSessionId !== 'string' || providerSessionId.trim().length === 0) {
    return
  }

  setProviderSessionId(agentSessionState, providerSessionId.trim())
}

/**
 * 从 branch thread metadata 读取一次性 provider fork 描述；损坏数据回退到本地历史链路。
 */
function readProviderSessionFork(thread: ThreadRecord): AgentProviderSessionFork | undefined {
  const value = thread.metadata?.providerSessionFork

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const providerSessionId = (value as Record<string, unknown>).providerSessionId
  const providerMessageId = (value as Record<string, unknown>).providerMessageId

  if (
    typeof providerSessionId !== 'string' ||
    providerSessionId.trim().length === 0 ||
    typeof providerMessageId !== 'string' ||
    providerMessageId.trim().length === 0
  ) {
    return undefined
  }

  return {
    providerSessionId: providerSessionId.trim(),
    providerMessageId: providerMessageId.trim()
  }
}

/**
 * 维护会话运行时里和 agent backend 创建相关的短生命周期状态。
 */
export class SessionAgentRuntime {
  private readonly agentSessionRuntimeStates = new Map<string, AgentSessionRuntimeState>()
  private readonly createAgentBackend: AgentBackendFactory
  private readonly permissionModeResolver?: SessionPermissionModeResolver
  private readonly sessionScopedToolCallbacks = new SessionScopedToolCallbackRegistry()
  private readonly sourceActivator?: SessionSourceActivator
  private readonly sourceProvider?: SessionSourceProvider

  /**
   * 注入 backend factory 和会话级 source/permission runtime provider。
   */
  constructor({
    createAgentBackend,
    permissionModeResolver,
    sourceActivator,
    sourceProvider
  }: SessionAgentRuntimeInput) {
    this.createAgentBackend = createAgentBackend
    this.permissionModeResolver = permissionModeResolver
    this.sourceActivator = sourceActivator
    this.sourceProvider = sourceProvider
  }

  /**
   * 返回指定 thread 的内存态 agent session runtime state；同一 thread 后续 operation 复用。
   */
  resolveAgentSessionRuntimeState(threadId: string): AgentSessionRuntimeState {
    const existing = this.agentSessionRuntimeStates.get(threadId)

    if (existing !== undefined) {
      return existing
    }

    const state = createAgentSessionRuntimeState()

    this.agentSessionRuntimeStates.set(threadId, state)

    return state
  }

  /**
   * 释放指定 thread 的 agent session runtime state，供会话删除后回收进程内状态。
   */
  releaseAgentSessionRuntimeState(threadId: string): void {
    this.agentSessionRuntimeStates.delete(threadId)
  }

  /**
   * 记录 source activation 事件进入 thread 级 session runtime state。
   */
  recordActivatedSource(threadId: string, sourceSlug: string): void {
    addActivatedSourceSlug(this.resolveAgentSessionRuntimeState(threadId), sourceSlug)
  }

  /**
   * 记录当前 thread 的 provider session id，供下一次 backend 创建时恢复 SDK 会话。
   */
  recordProviderSessionId(threadId: string, providerSessionId: string): void {
    setProviderSessionId(this.resolveAgentSessionRuntimeState(threadId), providerSessionId)
  }

  /**
   * 清除指定 thread 的 provider session id，避免后续 turn 继续恢复已失效的 SDK 会话。
   */
  clearProviderSessionId(threadId: string): void {
    clearAgentProviderSessionId(this.resolveAgentSessionRuntimeState(threadId))
  }

  /**
   * 创建本轮 agent backend，并完成 session-scoped source activation callback 注入。
   */
  async createBackend({
    connection,
    messages,
    originalMessage,
    scope,
    workspace
  }: SessionAgentRuntimeCreateBackendInput): Promise<SessionAgentRuntimeCreateBackendResult> {
    const agentSessionState = this.resolveAgentSessionRuntimeState(scope.thread.id)

    hydrateProviderSessionId(agentSessionState, scope.thread)

    const permissionMode = await this.resolvePermissionModeForScope(scope)
    const providerSessionFork = readProviderSessionFork(scope.thread)
    const sources = await this.resolveSourcesForScope(scope, agentSessionState)
    const agentBackend = this.createAgentBackend(
      createConnectionAgentBackendConfig({
        agentSessionState,
        connection,
        messages,
        permissionMode,
        providerSessionFork,
        sources,
        workspace
      })
    )

    this.configureSessionScopedToolCallbacks(agentBackend, scope, originalMessage)

    return {
      agentBackend,
      agentSessionState
    }
  }

  /**
   * 清理指定 session 的 tool callback，避免 operation 结束后旧 backend 仍能触发状态写入。
   */
  releaseSessionCallbacks(sessionId: string): void {
    this.sessionScopedToolCallbacks.unregister(sessionId)
  }

  /**
   * 解析当前会话 turn 使用的 agent 权限模式；未注入 resolver 时保持默认 ask 语义。
   */
  private async resolvePermissionModeForScope(
    scope: SessionSourceProviderScope
  ): Promise<AgentPermissionMode> {
    if (this.permissionModeResolver === undefined) {
      return defaultAgentPermissionMode
    }

    return this.permissionModeResolver.resolvePermissionMode(scope)
  }

  /**
   * 从可选 source provider 读取当前会话可见的 sources；空列表不写入 backend config。
   */
  private async resolveSourcesForScope(
    scope: SessionSourceProviderScope,
    agentSessionState: AgentSessionRuntimeState
  ): Promise<AgentSourceRecord[] | undefined> {
    if (this.sourceProvider === undefined) {
      return undefined
    }

    const sources = await this.sourceProvider.resolveSources(scope)
    const resolvedSources = applySessionActivatedSources(sources, agentSessionState)

    return resolvedSources.length === 0 ? undefined : resolvedSources
  }

  /**
   * 注册当前会话的 session-scoped tool 回调，并给 backend 注入 source activation 请求桥。
   */
  private configureSessionScopedToolCallbacks(
    agentBackend: AgentBackend,
    scope: SessionSourceProviderScope,
    originalMessage: string
  ): void {
    const sessionId = scope.session.id
    const agentSessionState = this.resolveAgentSessionRuntimeState(scope.thread.id)

    this.sessionScopedToolCallbacks.register(sessionId, {
      activateSourceInSessionFn: async (sourceSlug: string): Promise<boolean> => {
        if (
          this.sourceActivator === undefined ||
          agentBackend.setPendingSourceActivationRestart === undefined
        ) {
          return false
        }

        const activated = await this.sourceActivator.activateSource(scope, sourceSlug)

        if (!activated) {
          return false
        }

        addActivatedSourceSlug(agentSessionState, sourceSlug)

        agentBackend.setPendingSourceActivationRestart({
          sourceSlug,
          originalMessage
        })

        return true
      }
    })

    agentBackend.onSourceActivationRequest = async (sourceSlug: string): Promise<boolean> => {
      const activateSourceInSessionFn =
        this.sessionScopedToolCallbacks.get(sessionId)?.activateSourceInSessionFn

      return activateSourceInSessionFn?.(sourceSlug) ?? false
    }
  }
}
