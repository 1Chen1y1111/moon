/**
 * 负责把会话输入和 operation 记录解析成可运行的 agent target。
 * 它只处理 provider/connection 选择、凭据注入和可执行校验，不创建消息或执行 backend。
 */

import {
  assertLlmConnectionReadyForAgent,
  assertProviderReadyForAgent,
  createProviderLlmConnection,
  resolveAgentBackendProvider,
  resolveConnectionAgentBackendProvider
} from '@moon/shared/agent'
import type { NormalizedLlmConnection } from '@moon/shared/config'
import type { AgentOperationRecord, SessionRecord } from '@moon/shared/domain/chat'
import type { SendChatMessageInput } from '@moon/shared/domain/chat-validation'
import {
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider
} from '@moon/shared/domain/chat-provider'
import type { ProviderId } from '@moon/shared/domain/provider'
import type { ProviderSettings } from '@moon/shared/domain/settings'
import type { SessionsRepositoryPort, SettingsRepositoryPort } from './session-manager'

export type SessionAgentTargetRuntimeInput = {
  sessionsRepository: SessionsRepositoryPort
  settingsRepository: SettingsRepositoryPort
}

export type SessionAgentTargetResult = {
  connection: NormalizedLlmConnection
  persistedLlmConnectionId: string | null
  providerId: ProviderId
  session: SessionRecord | null
}

export type SessionAgentTargetResolveInput = SendChatMessageInput

export type SessionOperationAgentTargetResolveInput = {
  operation: AgentOperationRecord
  session: SessionRecord
}

/**
 * 管理会话层 provider/connection 解析，给 message turn 和 operation execution 复用。
 */
export class SessionAgentTargetRuntime {
  private readonly sessionsRepository: SessionsRepositoryPort
  private readonly settingsRepository: SettingsRepositoryPort

  /**
   * 注入读取会话和 provider/connection 设置所需的仓储端口。
   */
  constructor({ sessionsRepository, settingsRepository }: SessionAgentTargetRuntimeInput) {
    this.sessionsRepository = sessionsRepository
    this.settingsRepository = settingsRepository
  }

  /**
   * 解析默认 agent target，优先使用持久化默认 connection，再回退默认 provider。
   */
  async resolveDefaultTarget(): Promise<SessionAgentTargetResult> {
    const connection = await this.settingsRepository.selectDefaultLlmConnection()

    if (connection !== null) {
      return this.createConnectionAgentTarget(connection, null)
    }

    const settings = await this.settingsRepository.getSettings()

    return this.createProviderAgentTarget(selectDefaultChatProvider(settings), null)
  }

  /**
   * 解析新消息应使用的 agent target，显式 connection 优先于 provider 和会话默认值。
   */
  async resolveMessageTarget(
    input: SessionAgentTargetResolveInput
  ): Promise<SessionAgentTargetResult> {
    const settings = await this.settingsRepository.getSettings()

    if (input.sessionId !== undefined) {
      const session = await this.sessionsRepository.findById(input.sessionId)

      if (session === null) {
        throw new Error('Chat session not found.')
      }

      if (input.llmConnectionId !== undefined) {
        const inputConnection = await this.resolveInputLlmConnection(input.llmConnectionId)

        return this.createConnectionAgentTarget(
          inputConnection,
          {
            ...session,
            provider: inputConnection.providerId ?? input.provider ?? session.provider,
            llmConnectionId: inputConnection.id
          },
          input.provider ?? session.provider
        )
      }

      if (input.provider !== undefined) {
        const providerConnection = await this.resolveProviderLlmConnection(input.provider)

        if (providerConnection !== null) {
          return this.createConnectionAgentTarget(
            providerConnection,
            {
              ...session,
              provider: input.provider,
              llmConnectionId: providerConnection.id
            },
            input.provider
          )
        }

        return this.createProviderAgentTarget(settings.providers[input.provider], {
          ...session,
          provider: input.provider,
          llmConnectionId: null
        })
      }

      const sessionConnection = await this.resolveSessionLlmConnection(session)

      if (sessionConnection !== null) {
        return this.createConnectionAgentTarget(sessionConnection, session, session.provider)
      }

      return this.createProviderAgentTarget(settings.providers[session.provider], session)
    }

    if (input.llmConnectionId !== undefined) {
      const inputConnection = await this.resolveInputLlmConnection(input.llmConnectionId)

      return this.createConnectionAgentTarget(inputConnection, null, input.provider)
    }

    if (input.provider !== undefined) {
      const providerConnection = await this.resolveProviderLlmConnection(input.provider)

      if (providerConnection !== null) {
        return this.createConnectionAgentTarget(providerConnection, null, input.provider)
      }

      return this.createProviderAgentTarget(settings.providers[input.provider], null)
    }

    return this.resolveDefaultTarget()
  }

  /**
   * 解析 operation 运行时 target，并把 operation 上锁定的模型覆盖到 connection。
   */
  async resolveOperationTarget({
    operation,
    session
  }: SessionOperationAgentTargetResolveInput): Promise<SessionAgentTargetResult> {
    const operationConnectionId =
      typeof operation.appContext?.llmConnectionId === 'string'
        ? operation.appContext.llmConnectionId
        : undefined
    const connection =
      operationConnectionId === undefined
        ? await this.resolveSessionLlmConnection(session)
        : await this.settingsRepository.findLlmConnectionById(operationConnectionId)
    const target =
      connection === null
        ? await this.resolveOperationProviderTarget(operation, session)
        : await this.createConnectionAgentTarget(
            connection,
            session,
            operation.provider ?? session.provider
          )

    return {
      ...target,
      connection: this.withOperationModel(target.connection, operation)
    }
  }

  /**
   * 通过 operation/session 记录的 provider 回退解析运行目标。
   */
  private async resolveOperationProviderTarget(
    operation: AgentOperationRecord,
    session: SessionRecord
  ): Promise<SessionAgentTargetResult> {
    const settings = await this.settingsRepository.getSettings()

    return this.createProviderAgentTarget(
      settings.providers[operation.provider ?? session.provider],
      session
    )
  }

  /**
   * 通过 session 记录的 connection id 查找持久化连接，缺失时返回 null 以便回退 provider。
   */
  private async resolveSessionLlmConnection(
    session: SessionRecord
  ): Promise<NormalizedLlmConnection | null> {
    return session.llmConnectionId === undefined || session.llmConnectionId === null
      ? null
      : this.settingsRepository.findLlmConnectionById(session.llmConnectionId)
  }

  /**
   * 解析用户显式指定的 connection，缺失时抛错避免静默切到其它模型。
   */
  private async resolveInputLlmConnection(id: string): Promise<NormalizedLlmConnection> {
    const connection = await this.settingsRepository.findLlmConnectionById(id)

    if (connection === null) {
      throw new Error('LLM connection not found.')
    }

    return connection
  }

  /**
   * 按 provider id 查找同步出来的同名 connection，仅在仍启用且归属匹配时使用。
   */
  private async resolveProviderLlmConnection(
    provider: ProviderId
  ): Promise<NormalizedLlmConnection | null> {
    const connection = await this.settingsRepository.findLlmConnectionById(provider)

    if (connection === null || !connection.enabled) {
      return null
    }

    if (connection.providerId !== undefined && connection.providerId !== provider) {
      return null
    }

    return connection
  }

  /**
   * 对 provider 派生连接使用最新 provider 设置生成运行时连接，避免旧连接协议滞留。
   * 旧数据可能没有 providerId，此时借助会话或输入 provider 归属兜底识别。
   */
  private async refreshProviderBackedConnection(
    connection: NormalizedLlmConnection,
    fallbackProviderId?: ProviderId
  ): Promise<NormalizedLlmConnection> {
    const currentBackend = resolveConnectionAgentBackendProvider(connection)

    if (currentBackend === 'pi' || currentBackend === 'pi_compat') {
      return connection
    }

    const settings = await this.settingsRepository.getSettings()
    const providerId =
      connection.providerId ??
      (settings.providers[connection.id] === undefined ? fallbackProviderId : connection.id)

    if (providerId === undefined) {
      return connection
    }

    const provider = settings.providers[providerId]

    if (provider === undefined || !provider.enabled || !isSupportedChatProvider(provider)) {
      return connection
    }

    const storedProvider = await this.withStoredApiKey(provider)
    const providerWithApiKey = storedProvider.apiKey.trim()
      ? storedProvider
      : {
          ...storedProvider,
          apiKey: connection.apiKey ?? ''
        }
    const model = selectChatModel(providerWithApiKey)

    try {
      assertProviderReadyForAgent(providerWithApiKey, model)
    } catch {
      return connection
    }

    const providerConnection = createProviderLlmConnection(providerWithApiKey, model)
    const providerBackend = resolveConnectionAgentBackendProvider(providerConnection)

    if (currentBackend === providerBackend) {
      return connection
    }

    return {
      ...providerConnection,
      id: connection.id,
      enabled: connection.enabled,
      isDefault: connection.isDefault,
      thinkingLevel: connection.thinkingLevel,
      providerId: connection.providerId ?? providerConnection.providerId
    }
  }

  /**
   * 基于持久化 LLM connection 创建 agent target，并完成 connection 级可执行校验。
   */
  private async createConnectionAgentTarget(
    connection: NormalizedLlmConnection,
    session: SessionRecord | null,
    fallbackProviderId?: ProviderId
  ): Promise<SessionAgentTargetResult> {
    const runtimeConnection = await this.refreshProviderBackedConnection(
      connection,
      fallbackProviderId
    )

    assertLlmConnectionReadyForAgent(runtimeConnection)

    return {
      connection: runtimeConnection,
      persistedLlmConnectionId: connection.id,
      providerId: runtimeConnection.providerId ?? fallbackProviderId ?? runtimeConnection.id,
      session
    }
  }

  /**
   * 基于 provider fallback 创建 agent target，并把 provider 设置派生成 connection。
   */
  private async createProviderAgentTarget(
    provider: ProviderSettings | undefined,
    session: SessionRecord | null
  ): Promise<SessionAgentTargetResult> {
    if (provider === undefined) {
      throw new Error('Unknown provider.')
    }

    if (!provider.enabled) {
      throw new Error(`${provider.name} is disabled.`)
    }

    const providerWithApiKey = await this.withStoredApiKey(provider)
    const model = selectChatModel(providerWithApiKey)

    if (!isSupportedChatProvider(providerWithApiKey)) {
      const backend = resolveAgentBackendProvider(providerWithApiKey, model)

      if (backend === 'pi' || backend === 'pi_compat') {
        assertProviderReadyForAgent(providerWithApiKey, model)
      }

      throw new Error(`${provider.name} is not supported for chat.`)
    }

    assertProviderReadyForAgent(providerWithApiKey, model)

    const connection = createProviderLlmConnection(providerWithApiKey, model)

    return {
      connection,
      persistedLlmConnectionId: null,
      providerId: providerWithApiKey.provider,
      session:
        session === null
          ? null
          : {
              ...session,
              provider: providerWithApiKey.provider,
              llmConnectionId: null
            }
    }
  }

  /**
   * 运行历史 operation 时保留 operation 上锁定的模型，同时复用 connection 的凭据和端点。
   */
  private withOperationModel(
    connection: NormalizedLlmConnection,
    operation: AgentOperationRecord
  ): NormalizedLlmConnection {
    return operation.model === null || operation.model === undefined
      ? connection
      : { ...connection, model: operation.model }
  }

  /**
   * 读取持久化 API key 并合并进 provider 设置，避免 renderer 接触密钥。
   */
  private async withStoredApiKey(provider: ProviderSettings): Promise<ProviderSettings> {
    const apiKey = await this.settingsRepository.getProviderApiKey(provider.provider)

    return {
      ...provider,
      apiKey
    }
  }
}
