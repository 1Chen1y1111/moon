/**
 * 负责把 AppSettings 中的 LLM connection 和 provider 转换成首页聊天目标。
 * 它只做 renderer 侧纯数据选择，不调用 IPC、不修改 provider 或 connection 配置。
 */

import {
  selectDefaultLlmConnection,
  type NormalizedLlmConnection
} from '@moon/shared/config'
import {
  findChatProviderModel,
  getSelectableChatProviderModels,
  isSelectableChatProvider,
  selectChatModelId,
  selectDefaultSelectableChatProvider
} from '@moon/shared/domain/chat-provider'
import type { ProviderModel } from '@moon/shared/domain/provider'
import type { AppSettings, ProviderSettings } from '@moon/shared/domain/settings'

export type ChatProviderGroup = {
  models: ProviderModel[]
  provider: ProviderSettings
}

export type SelectedChatTarget = {
  connection?: NormalizedLlmConnection
  model?: ProviderModel
  modelId: string
  modelLabel: string
  provider?: ProviderSettings
}

type ChatTargetInput = {
  activeSessionConnectionId?: string | null
  activeSessionProvider?: string
  draftProviderId?: string | null
}

/**
 * 解析 connection 归属的 provider id，兼容旧数据里只有同名 id 的情况。
 */
function getConnectionProviderId(connection: NormalizedLlmConnection): string {
  return connection.providerId ?? connection.id
}

/**
 * 从 connection 生成兜底模型元数据，避免刷新模型列表缺失时 UI 没有显示名称。
 */
function createConnectionModel(connection: NormalizedLlmConnection): ProviderModel {
  return {
    id: connection.model,
    name: connection.model,
    enabled: true,
    isManual: true
  }
}

/**
 * 使用 provider 模型目录补全 connection 模型元数据，找不到时回退到 connection 自身。
 */
function resolveConnectionModel(
  connection: NormalizedLlmConnection,
  provider: ProviderSettings
): ProviderModel {
  return findChatProviderModel(provider, connection.model) ?? createConnectionModel(connection)
}

/**
 * 根据 provider id 查找可用 connection，支持 providerId 和同名 id 两种映射。
 */
function findEnabledConnectionForProvider(
  connections: NormalizedLlmConnection[],
  providerId: string
): NormalizedLlmConnection | undefined {
  return connections.find(
    (connection) =>
      connection.enabled &&
      (connection.providerId === providerId ||
        (connection.providerId === undefined && connection.id === providerId))
  )
}

/**
 * 选择当前页面应使用的 connection；草稿选择优先，其次是会话记录和默认 connection。
 */
function selectActiveConnection(
  connections: NormalizedLlmConnection[],
  input: ChatTargetInput
): NormalizedLlmConnection | undefined {
  const enabledConnections = connections.filter((connection) => connection.enabled)

  if (enabledConnections.length === 0) {
    return undefined
  }

  if (input.draftProviderId !== undefined && input.draftProviderId !== null) {
    return findEnabledConnectionForProvider(enabledConnections, input.draftProviderId)
  }

  if (input.activeSessionConnectionId !== undefined && input.activeSessionConnectionId !== null) {
    const sessionConnection = enabledConnections.find(
      (connection) => connection.id === input.activeSessionConnectionId
    )

    if (sessionConnection !== undefined) {
      return sessionConnection
    }
  }

  if (input.activeSessionProvider !== undefined) {
    const sessionProviderConnection = findEnabledConnectionForProvider(
      enabledConnections,
      input.activeSessionProvider
    )

    if (sessionProviderConnection !== undefined) {
      return sessionProviderConnection
    }
  }

  return selectDefaultLlmConnection(enabledConnections) ?? undefined
}

/**
 * 选择旧 provider fallback 目标，保持没有 connection 的历史配置仍能显示。
 */
function selectFallbackProvider(
  settings: AppSettings,
  input: ChatTargetInput
): ProviderSettings | undefined {
  const draftProvider =
    input.draftProviderId === undefined || input.draftProviderId === null
      ? undefined
      : settings.providers[input.draftProviderId]

  if (draftProvider?.enabled && isSelectableChatProvider(draftProvider)) {
    return draftProvider
  }

  if (input.activeSessionProvider !== undefined) {
    return settings.providers[input.activeSessionProvider]
  }

  try {
    return selectDefaultSelectableChatProvider(settings)
  } catch {
    return undefined
  }
}

/**
 * 从 provider 生成聊天目标；未选模型时保留 provider 信息供发送逻辑判断。
 */
function createProviderTarget(provider: ProviderSettings | undefined): SelectedChatTarget {
  const modelId = selectChatModelId(provider)
  const model = findChatProviderModel(provider, modelId)

  return {
    provider,
    model,
    modelId,
    modelLabel: model?.name.trim() || modelId || '未选择模型'
  }
}

/**
 * 选择首页当前聊天目标，优先使用真实 connection，再回退旧 provider 推导。
 */
export function selectChatTarget(
  settings: AppSettings,
  input: ChatTargetInput
): SelectedChatTarget {
  const connection = selectActiveConnection(settings.llmConnections, input)

  if (connection !== undefined) {
    const provider = settings.providers[getConnectionProviderId(connection)]

    if (provider !== undefined) {
      const model = resolveConnectionModel(connection, provider)

      return {
        connection,
        provider,
        model,
        modelId: connection.model,
        modelLabel: model.name.trim() || model.id
      }
    }
  }

  return createProviderTarget(selectFallbackProvider(settings, input))
}

/**
 * 创建模型切换弹层分组；存在可用 connection 时只展示 connection 对应模型。
 */
export function createChatProviderGroups(settings: AppSettings): ChatProviderGroup[] {
  const connectionGroups = createConnectionProviderGroups(settings)

  if (connectionGroups.length > 0) {
    return connectionGroups
  }

  return Object.values(settings.providers)
    .filter((provider) => provider.enabled && isSelectableChatProvider(provider))
    .map((provider) => ({
      provider,
      models: getSelectableChatProviderModels(provider)
    }))
}

/**
 * 把 connection 列表按 provider 分组，忽略无法映射到当前 provider 配置的连接。
 */
function createConnectionProviderGroups(settings: AppSettings): ChatProviderGroup[] {
  const groups = new Map<string, ChatProviderGroup>()

  for (const connection of settings.llmConnections) {
    if (!connection.enabled) {
      continue
    }

    const provider = settings.providers[getConnectionProviderId(connection)]

    if (provider === undefined) {
      continue
    }

    const model = resolveConnectionModel(connection, provider)
    const existingGroup = groups.get(provider.provider)

    if (existingGroup === undefined) {
      groups.set(provider.provider, {
        provider,
        models: [model]
      })
      continue
    }

    if (!existingGroup.models.some((candidate) => candidate.id === model.id)) {
      existingGroup.models.push(model)
    }
  }

  return Array.from(groups.values())
}
