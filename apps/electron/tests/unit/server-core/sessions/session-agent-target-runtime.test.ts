// @vitest-environment node

/**
 * 负责验证 SessionAgentTargetRuntime 的 provider/connection 解析优先级。
 * 测试只覆盖 server-core 内部 target 选择，不创建消息 turn 或执行 backend。
 */

import { describe, expect, it, vi } from 'vitest'

import type { AgentOperationRecord, SessionRecord } from '@moon/shared/domain/chat'
import type { ProviderModel } from '@moon/shared/domain/provider'
import {
  createDefaultAppSettings,
  createDefaultProviderSettings,
  type AppSettings,
  type ProviderSettings
} from '@moon/shared/domain/settings'
import { llmConnectionSchema, type NormalizedLlmConnection } from '@moon/shared/config'
import {
  SessionAgentTargetRuntime,
  type SessionAgentTargetRuntimeInput
} from '@moon/server-core/sessions/session-agent-target-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'

/**
 * 创建可执行的 Anthropic connection fixture。
 */
function createConnection(
  input: Partial<NormalizedLlmConnection> = {}
): NormalizedLlmConnection {
  return llmConnectionSchema.parse({
    id: 'connection-1',
    name: 'Claude Connection',
    providerId: 'claude',
    backend: 'anthropic',
    model: 'claude-sonnet-4-6',
    apiKey: 'connection-key',
    enabled: true,
    isDefault: true,
    thinkingLevel: 'medium',
    ...input
  })
}

/**
 * 创建测试用会话记录。
 */
function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    llmConnectionId: null,
    projectId: null,
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 operation target 测试用记录。
 */
function createOperation(
  overrides: Partial<AgentOperationRecord> = {}
): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: {
      sessionId: 'session-1',
      llmConnectionId: 'operation-connection'
    },
    provider: 'claude',
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'running',
    model: 'locked-model',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建 provider 设置，并默认补齐可执行 Anthropic 配置。
 */
function createProviderSettings(
  input: Partial<ProviderSettings> & Pick<ProviderSettings, 'provider'>
): ProviderSettings {
  const defaults = createDefaultProviderSettings(input.provider)

  return {
    ...defaults,
    enabled: true,
    apiKey: 'stored-key',
    hasApiKey: true,
    model: 'test-model',
    ...input
  }
}

/**
 * 创建测试 settings，未指定 provider 保留默认配置。
 */
function createSettings(providers: ProviderSettings[]): AppSettings {
  return {
    ...createDefaultAppSettings(),
    providers: {
      ...createDefaultAppSettings().providers,
      ...Object.fromEntries(providers.map((provider) => [provider.provider, provider]))
    }
  }
}

/**
 * 创建 Claude provider 设置。
 */
function createClaudeProvider(input: Partial<ProviderSettings> = {}): ProviderSettings {
  return createProviderSettings({
    provider: 'claude',
    type: 'anthropic',
    model: 'claude-sonnet-4-6',
    ...input
  })
}

/**
 * 创建 DeepSeek OpenAI-compatible 模型，用于触发 Pi-compatible not wired 分支。
 */
function createDeepSeekOpenAiModel(): ProviderModel {
  return {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    enabled: true,
    isManual: false,
    providerApi: 'openai-completions',
    providerBaseUrl: 'https://api.deepseek.com'
  }
}

/**
 * 创建 DeepSeek provider 设置。
 */
function createDeepSeekProvider(): ProviderSettings {
  const model = createDeepSeekOpenAiModel()

  return createProviderSettings({
    provider: 'deepseek',
    type: 'deepseek',
    model: model.id,
    models: [model],
    availableModels: [model]
  })
}

/**
 * 创建 runtime 聚焦测试使用的内存 settings/session 仓储。
 */
function createRuntimeFixture(
  input: {
    apiKeys?: Partial<Record<ProviderSettings['provider'], string>>
    connections?: NormalizedLlmConnection[]
    defaultConnection?: NormalizedLlmConnection | null
    sessions?: SessionRecord[]
    settings?: AppSettings
  } = {}
): SessionAgentTargetRuntime {
  const settings = input.settings ?? createSettings([createClaudeProvider()])
  const connections = new Map(
    (input.connections ?? []).map((connection) => [connection.id, connection])
  )
  const sessions = new Map((input.sessions ?? []).map((session) => [session.id, session]))
  const dependencies: SessionAgentTargetRuntimeInput = {
    sessionsRepository: {
      list: async () => [...sessions.values()],
      findById: async (id) => sessions.get(id) ?? null,
      save: async (session) => {
        sessions.set(session.id, session)

        return session
      },
      deleteById: async (id) => {
        sessions.delete(id)
      }
    },
    settingsRepository: {
      findLlmConnectionById: vi.fn(async (id) => connections.get(id) ?? null),
      getProviderApiKey: vi.fn(
        async (provider) => input.apiKeys?.[provider] ?? settings.providers[provider]?.apiKey ?? ''
      ),
      getSettings: vi.fn(async () => settings),
      selectDefaultLlmConnection: vi.fn(async () => input.defaultConnection ?? null)
    }
  }

  return new SessionAgentTargetRuntime(dependencies)
}

describe('SessionAgentTargetRuntime', () => {
  it('uses default LLM connection before provider fallback', async () => {
    const defaultConnection = createConnection({
      id: 'default-connection',
      name: 'Default Claude',
      isDefault: true
    })
    const runtime = createRuntimeFixture({
      connections: [defaultConnection],
      defaultConnection
    })

    const target = await runtime.resolveDefaultTarget()

    expect(target).toMatchObject({
      connection: defaultConnection,
      persistedLlmConnectionId: 'default-connection',
      providerId: 'claude',
      session: null
    })
  })

  it('throws when explicit LLM connection does not exist', async () => {
    const runtime = createRuntimeFixture()

    await expect(
      runtime.resolveMessageTarget({
        llmConnectionId: 'missing',
        content: 'hello'
      })
    ).rejects.toThrow('LLM connection not found.')
  })

  it('uses provider-backed connection for session provider and falls back to provider settings', async () => {
    const session = createSession()
    const providerConnection = createConnection({
      id: 'claude',
      providerId: 'claude'
    })
    const connectionRuntime = createRuntimeFixture({
      connections: [providerConnection],
      sessions: [session]
    })

    const connectionTarget = await connectionRuntime.resolveMessageTarget({
      sessionId: session.id,
      provider: 'claude',
      content: 'hello'
    })

    expect(connectionTarget).toMatchObject({
      connection: providerConnection,
      persistedLlmConnectionId: 'claude',
      providerId: 'claude',
      session: expect.objectContaining({
        id: session.id,
        provider: 'claude',
        llmConnectionId: 'claude'
      })
    })

    const fallbackRuntime = createRuntimeFixture({
      apiKeys: { claude: 'stored-fallback-key' },
      sessions: [session]
    })
    const fallbackTarget = await fallbackRuntime.resolveMessageTarget({
      sessionId: session.id,
      provider: 'claude',
      content: 'hello'
    })

    expect(fallbackTarget).toMatchObject({
      persistedLlmConnectionId: null,
      providerId: 'claude',
      session: expect.objectContaining({
        id: session.id,
        provider: 'claude',
        llmConnectionId: null
      })
    })
    expect(fallbackTarget.connection).toMatchObject({
      id: 'claude',
      providerId: 'claude',
      backend: 'anthropic',
      apiKey: 'stored-fallback-key'
    })
  })

  it('uses operation connection and keeps operation model override', async () => {
    const session = createSession({
      llmConnectionId: 'session-connection'
    })
    const operationConnection = createConnection({
      id: 'operation-connection',
      model: 'connection-model'
    })
    const runtime = createRuntimeFixture({
      connections: [operationConnection],
      sessions: [session]
    })

    const target = await runtime.resolveOperationTarget({
      operation: createOperation(),
      session
    })

    expect(target).toMatchObject({
      persistedLlmConnectionId: 'operation-connection',
      providerId: 'claude',
      session
    })
    expect(target.connection).toMatchObject({
      id: 'operation-connection',
      model: 'locked-model'
    })
  })

  it('keeps Pi-compatible provider as not wired', async () => {
    const runtime = createRuntimeFixture({
      apiKeys: { deepseek: 'sk-deepseek-demo' },
      settings: createSettings([createDeepSeekProvider()])
    })

    await expect(
      runtime.resolveMessageTarget({
        provider: 'deepseek',
        content: 'hello'
      })
    ).rejects.toThrow('Pi backend is not wired yet')
  })
})
