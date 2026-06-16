// @vitest-environment node

/**
 * 负责验证 ChatService 的主进程会话编排和 agent 事件落库行为。
 * 测试使用内存仓储和 mock backend，不触发真实 SDK 或数据库。
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatService } from '@main/services/chat-service'
import type {
  AgentOperationRecord,
  MessageRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { SessionRecord } from '@moon/shared/domain/chat'
import {
  createDefaultAppSettings,
  createDefaultProviderSettings
} from '@moon/shared/domain/settings'
import type { AppSettings, ProviderSettings } from '@moon/shared/domain/settings'
import type { AgentBackend, AgentBackendConfig, AgentEvent } from '@moon/shared/agent'
import {
  llmConnectionSchema,
  selectDefaultLlmConnection,
  type NormalizedLlmConnection
} from '@moon/shared/config'

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

function createSettings(providers: ProviderSettings[]): AppSettings {
  return {
    ...createDefaultAppSettings(),
    providers: Object.fromEntries(providers.map((provider) => [provider.provider, provider]))
  }
}

function createClaudeSettings(input: Partial<ProviderSettings> = {}): AppSettings {
  return createSettings([
    createProviderSettings({
      provider: 'claude',
      type: 'anthropic',
      model: 'claude-sonnet-4-5',
      ...input
    })
  ])
}

function createAnthropicCompatibleProvider(
  input: Partial<ProviderSettings> & Pick<ProviderSettings, 'provider'>
): ProviderSettings {
  return createProviderSettings({
    apiFormat: 'anthropic',
    baseUrl: 'https://api.example.com',
    model: 'anthropic/claude-sonnet',
    ...input
  })
}

/**
 * 创建 Anthropic Messages 兼容 connection fixture。
 */
function createAnthropicCompatConnection(
  input: Partial<NormalizedLlmConnection> = {}
): NormalizedLlmConnection {
  return llmConnectionSchema.parse({
    id: 'compat-main',
    name: 'Compat Main',
    providerId: 'openrouter',
    backend: 'pi_compat',
    model: 'anthropic/claude-sonnet',
    apiKey: 'stored-connection-key',
    baseUrl: 'https://compat.example.com',
    customEndpoint: { api: 'anthropic-messages' },
    enabled: true,
    isDefault: true,
    thinkingLevel: 'medium',
    ...input
  })
}

class SessionsRepositoryMock {
  readonly sessions: SessionRecord[]

  constructor(sessions: SessionRecord[] = []) {
    this.sessions = sessions
  }

  async list(): Promise<SessionRecord[]> {
    return this.sessions
  }

  async findById(id: string): Promise<SessionRecord | null> {
    return this.sessions.find((session) => session.id === id) ?? null
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const index = this.sessions.findIndex((candidate) => candidate.id === session.id)

    if (index === -1) {
      this.sessions.push(session)
    } else {
      this.sessions[index] = session
    }

    return session
  }

  async deleteById(id: string): Promise<void> {
    const index = this.sessions.findIndex((session) => session.id === id)

    if (index !== -1) {
      this.sessions.splice(index, 1)
    }
  }
}

class MessagesRepositoryMock {
  readonly messages: MessageRecord[]

  constructor(messages: MessageRecord[] = []) {
    this.messages = messages
  }

  async listBySession(sessionId: string): Promise<MessageRecord[]> {
    return this.messages.filter((message) => message.sessionId === sessionId)
  }

  async listByThread(threadId: string): Promise<MessageRecord[]> {
    return this.messages.filter((message) => message.threadId === threadId)
  }

  async listByOperation(operationId: string): Promise<MessageRecord[]> {
    return this.messages.filter((message) => message.operationId === operationId)
  }

  async save(message: MessageRecord): Promise<MessageRecord> {
    const index = this.messages.findIndex((candidate) => candidate.id === message.id)

    if (index === -1) {
      this.messages.push(message)
    } else {
      this.messages[index] = message
    }

    return message
  }
}

class TopicsRepositoryMock {
  readonly topics: TopicRecord[]

  constructor(topics: TopicRecord[] = []) {
    this.topics = topics
  }

  async listBySession(sessionId: string): Promise<TopicRecord[]> {
    return this.topics.filter((topic) => topic.sessionId === sessionId)
  }

  async findById(id: string): Promise<TopicRecord | null> {
    return this.topics.find((topic) => topic.id === id) ?? null
  }

  async save(topic: TopicRecord): Promise<TopicRecord> {
    const index = this.topics.findIndex((candidate) => candidate.id === topic.id)

    if (index === -1) {
      this.topics.push(topic)
    } else {
      this.topics[index] = topic
    }

    return topic
  }
}

class ThreadsRepositoryMock {
  readonly threads: ThreadRecord[]

  constructor(threads: ThreadRecord[] = []) {
    this.threads = threads
  }

  async listBySession(_sessionId: string): Promise<ThreadRecord[]> {
    void _sessionId
    return this.threads
  }

  async listByTopic(topicId: string): Promise<ThreadRecord[]> {
    return this.threads.filter((thread) => thread.topicId === topicId)
  }

  async findById(id: string): Promise<ThreadRecord | null> {
    return this.threads.find((thread) => thread.id === id) ?? null
  }

  async save(thread: ThreadRecord): Promise<ThreadRecord> {
    const index = this.threads.findIndex((candidate) => candidate.id === thread.id)

    if (index === -1) {
      this.threads.push(thread)
    } else {
      this.threads[index] = thread
    }

    return thread
  }
}

class AgentOperationsRepositoryMock {
  readonly operations: AgentOperationRecord[] = []

  async findById(id: string): Promise<AgentOperationRecord | null> {
    return this.operations.find((operation) => operation.id === id) ?? null
  }

  async save(operation: AgentOperationRecord): Promise<AgentOperationRecord> {
    const index = this.operations.findIndex((candidate) => candidate.id === operation.id)

    if (index === -1) {
      this.operations.push(operation)
    } else {
      this.operations[index] = operation
    }

    return operation
  }
}

class ToolInvocationsRepositoryMock {
  readonly invocations: ToolInvocationRecord[] = []

  async findById(id: string): Promise<ToolInvocationRecord | null> {
    return this.invocations.find((invocation) => invocation.id === id) ?? null
  }

  async save(invocation: ToolInvocationRecord): Promise<ToolInvocationRecord> {
    const index = this.invocations.findIndex((candidate) => candidate.id === invocation.id)

    if (index === -1) {
      this.invocations.push(invocation)
    } else {
      this.invocations[index] = invocation
    }

    return invocation
  }
}

type CreateServiceResult = {
  createAgentBackend: ReturnType<typeof vi.fn>
  messagesRepository: MessagesRepositoryMock
  service: ChatService
  sessionsRepository: SessionsRepositoryMock
  settingsRepository: {
    findLlmConnectionById: (id: string) => Promise<NormalizedLlmConnection | null>
    getProviderApiKey: (provider: string) => Promise<string>
    getSettings: () => Promise<AppSettings>
    listLlmConnections: () => Promise<NormalizedLlmConnection[]>
    saveLlmConnection: (connection: NormalizedLlmConnection) => Promise<NormalizedLlmConnection>
    selectDefaultLlmConnection: () => Promise<NormalizedLlmConnection | null>
  }
  toolInvocationsRepository: ToolInvocationsRepositoryMock
}

function createMockAgentBackend(events: AgentEvent[]): AgentBackend {
  return {
    async *chat(): AsyncGenerator<AgentEvent> {
      for (const event of events) {
        yield event
      }
    },
    abort: vi.fn(async () => {}),
    destroy: vi.fn(),
    getModel: vi.fn(() => 'test-model'),
    isProcessing: vi.fn(() => false),
    setModel: vi.fn()
  }
}

function createService(input: {
  agentEvents?: AgentEvent[]
  attachmentsDirectory?: string
  createAgentBackend?: ReturnType<typeof vi.fn>
  llmConnections?: NormalizedLlmConnection[]
  messages?: MessageRecord[]
  sessions?: SessionRecord[]
  settings: AppSettings
}): CreateServiceResult {
  const sessionsRepository = new SessionsRepositoryMock(input.sessions)
  const messagesRepository = new MessagesRepositoryMock(input.messages)
  const topicsRepository = new TopicsRepositoryMock(
    input.sessions?.map((session) => ({
      id: `topic-${session.id}`,
      sessionId: session.id,
      title: '默认话题',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }))
  )
  const threadsRepository = new ThreadsRepositoryMock(
    topicsRepository.topics.map((topic) => ({
      id: `thread-${topic.sessionId}`,
      topicId: topic.id,
      title: '主线',
      type: 'standalone',
      status: 'active',
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt
    }))
  )
  const agentOperationsRepository = new AgentOperationsRepositoryMock()
  const toolInvocationsRepository = new ToolInvocationsRepositoryMock()
  const llmConnections = [...(input.llmConnections ?? [])]
  const settingsRepository = {
    findLlmConnectionById: vi.fn(
      async (id: string) => llmConnections.find((connection) => connection.id === id) ?? null
    ),
    getProviderApiKey: vi.fn(
      async (provider: string) => input.settings.providers[provider]?.apiKey ?? ''
    ),
    getSettings: vi.fn(async () => input.settings),
    listLlmConnections: vi.fn(async () => llmConnections),
    saveLlmConnection: vi.fn(async (connection: NormalizedLlmConnection) => {
      const index = llmConnections.findIndex((candidate) => candidate.id === connection.id)

      if (index === -1) {
        llmConnections.push(connection)
      } else {
        llmConnections[index] = connection
      }

      return connection
    }),
    selectDefaultLlmConnection: vi.fn(async () => selectDefaultLlmConnection(llmConnections))
  }
  const createAgentBackend =
    input.createAgentBackend ??
    vi.fn(() => createMockAgentBackend(input.agentEvents ?? [{ type: 'text_delta', text: 'ok' }]))

  return {
    createAgentBackend,
    messagesRepository,
    service: new ChatService({
      agentOperationsRepository: agentOperationsRepository as never,
      attachmentsDirectory: input.attachmentsDirectory,
      createAgentBackend: createAgentBackend as never,
      messagesRepository: messagesRepository as never,
      sessionsRepository: sessionsRepository as never,
      settingsRepository: settingsRepository as never,
      threadsRepository: threadsRepository as never,
      toolInvocationsRepository: toolInvocationsRepository as never,
      topicsRepository: topicsRepository as never
    }),
    sessionsRepository,
    settingsRepository,
    toolInvocationsRepository
  }
}

describe('ChatService provider resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects the first enabled supported Anthropic provider', async () => {
    const { selectDefaultChatProvider } = await import('@main/services/chat-service')
    const azure = createProviderSettings({
      provider: 'azure-openai',
      type: 'azure',
      model: 'deployment'
    })
    const codingPlan = createProviderSettings({
      provider: 'z-ai-coding-plan',
      kind: 'coding-plan',
      type: 'zai-coding-plan',
      model: 'glm-4.6'
    })
    const openai = createProviderSettings({
      provider: 'openai',
      model: 'gpt-5.4'
    })
    const claude = createProviderSettings({
      provider: 'claude',
      type: 'anthropic',
      model: 'claude-sonnet-4-5'
    })

    expect(selectDefaultChatProvider(createSettings([azure, codingPlan, openai, claude]))).toBe(
      claude
    )
    expect(() => selectDefaultChatProvider(createSettings([azure, codingPlan, openai]))).toThrow(
      'No enabled chat provider configured.'
    )
  })

  it('falls back from selected model to enabled model lists', async () => {
    const { selectChatModel } = await import('@main/services/chat-service')

    expect(
      selectChatModel(
        createProviderSettings({
          provider: 'openai',
          model: '',
          models: [{ id: 'model-list-id', name: 'Model List ID', enabled: true, isManual: true }],
          availableModels: [
            { id: 'available-id', name: 'Available ID', enabled: true, isManual: false }
          ]
        })
      )
    ).toBe('model-list-id')
    expect(
      selectChatModel(
        createProviderSettings({
          provider: 'openai',
          model: '',
          models: [],
          availableModels: [
            { id: 'available-id', name: 'Available ID', enabled: true, isManual: false }
          ]
        })
      )
    ).toBe('available-id')
    expect(() =>
      selectChatModel(
        createProviderSettings({
          provider: 'openai',
          model: '',
          models: [],
          availableModels: []
        })
      )
    ).toThrow('No model selected')
  })
})

describe('ChatService.sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves user and assistant messages for a new session', async () => {
    const settings = createClaudeSettings()
    const { messagesRepository, service, sessionsRepository } = createService({
      agentEvents: [{ type: 'text_delta', text: ' 你好，Moon 已经在线。 ' }],
      settings
    })

    const result = await service.sendMessage({ content: '  你好 Moon  ' })

    expect(result.session.title).toBe('你好 Moon')
    expect(sessionsRepository.sessions).toHaveLength(1)
    expect(messagesRepository.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant'
    ])
    expect(messagesRepository.messages.map((message) => message.content)).toEqual([
      '你好 Moon',
      '你好，Moon 已经在线。'
    ])
  })

  it('uses the requested provider for a new session', async () => {
    const openrouter = createAnthropicCompatibleProvider({
      provider: 'openrouter',
      type: 'openrouter'
    })
    const settings = createSettings([
      createProviderSettings({ provider: 'claude', type: 'anthropic', model: 'claude-sonnet-4-5' }),
      openrouter
    ])
    const { service, sessionsRepository } = createService({
      agentEvents: [{ type: 'text_delta', text: 'ok' }],
      settings
    })

    await service.sendMessage({ provider: 'openrouter', content: 'hello' })

    expect(sessionsRepository.sessions[0].provider).toBe('openrouter')
  })

  it('passes Anthropic-compatible providers through pi_compat connection config', async () => {
    const openrouter = createAnthropicCompatibleProvider({
      provider: 'openrouter',
      type: 'openrouter',
      baseUrl: 'https://compat.example.com',
      defaultBaseUrl: 'https://compat.example.com',
      model: 'anthropic/claude-sonnet'
    })
    const createAgentBackend = vi.fn((_config: AgentBackendConfig) =>
      createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    )
    const { service } = createService({
      createAgentBackend,
      settings: createSettings([openrouter])
    })

    await service.sendMessage({ content: 'hello' })

    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pi_compat',
        model: 'anthropic/claude-sonnet',
        apiKey: 'stored-key',
        baseUrl: 'https://compat.example.com',
        customEndpoint: { api: 'anthropic-messages' }
      })
    )
  })

  it('passes DeepSeek providers through OpenAI-compatible pi_compat config', async () => {
    const deepseek = createProviderSettings({
      provider: 'deepseek',
      type: 'deepseek',
      model: 'deepseek-v4-flash',
      availableModels: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          enabled: true,
          isManual: false,
          providerApi: 'openai-completions',
          providerBaseUrl: 'https://api.deepseek.com'
        }
      ],
      models: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          enabled: true,
          isManual: false,
          providerApi: 'openai-completions',
          providerBaseUrl: 'https://api.deepseek.com'
        }
      ]
    })
    const createAgentBackend = vi.fn((_config: AgentBackendConfig) =>
      createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    )
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      settings: createSettings([deepseek])
    })

    await service.sendMessage({ content: 'hello' })

    expect(sessionsRepository.sessions[0].llmConnectionId).toBeNull()
    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pi_compat',
        model: 'deepseek-v4-flash',
        apiKey: 'stored-key',
        baseUrl: 'https://api.deepseek.com',
        customEndpoint: { api: 'openai-completions' }
      })
    )
  })

  it('uses the persisted default LLM connection before provider fallback', async () => {
    const createAgentBackend = vi.fn((_config: AgentBackendConfig) =>
      createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    )
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      llmConnections: [createAnthropicCompatConnection()],
      settings: createDefaultAppSettings()
    })

    await service.sendMessage({ content: 'hello' })

    expect(sessionsRepository.sessions[0]).toMatchObject({
      provider: 'openrouter',
      llmConnectionId: 'compat-main'
    })
    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pi_compat',
        model: 'anthropic/claude-sonnet',
        apiKey: 'stored-connection-key',
        customEndpoint: { api: 'anthropic-messages' }
      })
    )
  })

  it('reuses the session LLM connection for follow-up turns', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      llmConnectionId: 'compat-main',
      projectId: null,
      provider: 'openrouter',
      title: 'Plan',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const createAgentBackend = vi.fn((_config: AgentBackendConfig) =>
      createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    )
    const { service } = createService({
      createAgentBackend,
      llmConnections: [createAnthropicCompatConnection({ isDefault: false })],
      sessions: [session],
      settings: createClaudeSettings()
    })

    await service.sendMessage({ sessionId: 'session-1', content: 'continue' })

    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pi_compat',
        model: 'anthropic/claude-sonnet',
        apiKey: 'stored-connection-key'
      })
    )
  })

  it('uses the requested provider for an existing session', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      projectId: null,
      provider: 'claude',
      title: 'Plan',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const openrouter = createAnthropicCompatibleProvider({
      provider: 'openrouter',
      type: 'openrouter'
    })
    const settings = createSettings([
      createProviderSettings({ provider: 'claude', type: 'anthropic', model: 'claude-sonnet-4-5' }),
      openrouter
    ])
    const { service, sessionsRepository } = createService({
      agentEvents: [{ type: 'text_delta', text: 'ok' }],
      sessions: [session],
      settings
    })

    await service.sendMessage({
      sessionId: 'session-1',
      provider: 'openrouter',
      content: 'hello'
    })

    expect(sessionsRepository.sessions[0].provider).toBe('openrouter')
  })

  it('keeps the user message but does not save an empty assistant response', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      projectId: null,
      provider: 'claude',
      title: '新聊天',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const settings = createClaudeSettings()
    const { messagesRepository, service } = createService({
      agentEvents: [{ type: 'text_delta', text: '   ' }],
      sessions: [session],
      settings
    })

    await expect(service.sendMessage({ sessionId: 'session-1', content: '继续' })).rejects.toThrow(
      'Model returned an empty response.'
    )
    expect(messagesRepository.messages).toHaveLength(2)
    expect(messagesRepository.messages[0]).toMatchObject({
      content: '继续',
      role: 'user',
      sessionId: 'session-1'
    })
    expect(messagesRepository.messages[1]).toMatchObject({
      role: 'assistant',
      status: 'error',
      error: 'Model returned an empty response.'
    })
  })

  it('emits saved user and assistant stream events while sending', async () => {
    const settings = createClaudeSettings()
    const events: unknown[] = []
    const { service } = createService({
      settings,
      agentEvents: [
        { type: 'text_delta', text: '你好' },
        { type: 'text_delta', text: '，Moon' }
      ]
    })

    const result = await service.sendMessage({ content: '测试' }, (event) => events.push(event))

    expect(result.messages.map((message) => message.content)).toEqual(['测试', '你好，Moon'])
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      'message-created',
      'message-created',
      'operation-started',
      'message-delta',
      'message-delta',
      'operation-done'
    ])
  })

  it('persists provider session ids and usage updates on operations', async () => {
    const settings = createClaudeSettings()
    const { service } = createService({
      settings,
      agentEvents: [
        { type: 'session_id_update', sessionId: 'sdk-session-1' },
        {
          type: 'usage_update',
          usage: {
            cacheReadTokens: 2,
            costUsd: 0.12,
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 17
          }
        },
        { type: 'text_delta', text: 'ok' }
      ]
    })

    const result = await service.sendMessage({ content: '测试 usage' })

    expect(result.operation).toMatchObject({
      metadata: { providerSessionId: 'sdk-session-1' },
      totalCost: '0.12',
      totalInputTokens: 10,
      totalOutputTokens: 5,
      totalTokens: 17,
      usage: {
        cacheReadTokens: 2,
        costUsd: 0.12,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 17
      }
    })
  })

  it('persists usage carried by complete events', async () => {
    const settings = createClaudeSettings()
    const { service } = createService({
      settings,
      agentEvents: [
        { type: 'text_delta', text: 'ok' },
        {
          type: 'complete',
          usage: {
            costUsd: 0.04,
            inputTokens: 3,
            outputTokens: 4
          }
        }
      ]
    })

    const result = await service.sendMessage({ content: '测试 complete usage' })

    expect(result.operation).toMatchObject({
      totalCost: '0.04',
      totalInputTokens: 3,
      totalOutputTokens: 4,
      totalTokens: 7,
      usage: {
        costUsd: 0.04,
        inputTokens: 3,
        outputTokens: 4,
        totalTokens: 7
      }
    })
  })

  it('persists status and info events on operation metadata', async () => {
    const settings = createClaudeSettings()
    const { service } = createService({
      settings,
      agentEvents: [
        {
          type: 'status',
          message: 'Claude is compacting context.',
          statusType: 'compacting'
        },
        {
          type: 'info',
          level: 'info',
          message: 'Claude tool Read is running (3s).'
        },
        { type: 'text_delta', text: 'ok' }
      ]
    })

    const result = await service.sendMessage({ content: '测试状态事件' })

    expect(result.operation.metadata).toMatchObject({
      lastAgentInfo: {
        level: 'info',
        message: 'Claude tool Read is running (3s).'
      },
      lastAgentStatus: {
        message: 'Claude is compacting context.',
        statusType: 'compacting'
      }
    })
  })

  it('persists tool start and result events on tool invocations', async () => {
    const settings = createClaudeSettings()
    const events: unknown[] = []
    const { service, toolInvocationsRepository } = createService({
      settings,
      agentEvents: [
        {
          type: 'tool_start',
          toolUseId: 'tool-1',
          toolName: 'Read',
          input: { file_path: 'README.md' }
        },
        {
          type: 'tool_result',
          toolUseId: 'tool-1',
          result: { output: 'hello' },
          isError: false
        },
        { type: 'text_delta', text: 'done' }
      ]
    })

    await service.sendMessage({ content: '跑工具' }, (event) => events.push(event))

    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        toolCallId: 'tool-1',
        name: 'Read',
        arguments: { file_path: 'README.md' },
        result: { output: 'hello' },
        status: 'done'
      })
    ])
    expect(events.map((event) => (event as { type: string }).type)).toContain('tool-start')
    expect(events.map((event) => (event as { type: string }).type)).toContain('tool-finish')
  })

  it('sends stored attachments as model message parts', async () => {
    const attachmentsDirectory = await mkdtemp(join(tmpdir(), 'moon-chat-attachments-'))
    const settings = createClaudeSettings()
    const createAgentBackend = vi.fn(() =>
      createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    )
    const { messagesRepository, service } = createService({
      attachmentsDirectory,
      createAgentBackend,
      settings
    })

    await writeFile(join(attachmentsDirectory, '11111111-1111-4111-8111-111111111111'), 'hello')

    await service.sendMessage({
      content: 'read this',
      attachments: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'note.txt',
          mimeType: 'text/plain',
          size: 5,
          kind: 'file',
          createdAt: '2026-05-09T00:00:00.000Z'
        }
      ]
    })

    expect(messagesRepository.messages[0].attachments).toEqual([
      expect.objectContaining({ name: 'note.txt', kind: 'file' })
    ])
    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'stored-key',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        provider: 'anthropic',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'read this\n\n[Attachment: note.txt]\nhello'
          })
        ]
      })
    )
  })

  it('does not create a session when provider setup is incomplete', async () => {
    const settings = createClaudeSettings({ apiKey: '', hasApiKey: false })
    const { service, sessionsRepository } = createService({ settings })

    await expect(service.sendMessage({ content: 'hello' })).rejects.toThrow('API key is required')
    expect(sessionsRepository.sessions).toEqual([])
  })
})

describe('ChatService.deleteSession', () => {
  it('deletes a chat session by id', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      projectId: null,
      provider: 'claude',
      title: 'Plan',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const settings = createClaudeSettings()
    const { service, sessionsRepository } = createService({
      sessions: [session],
      settings
    })

    await service.deleteSession({ sessionId: 'session-1' })

    expect(sessionsRepository.sessions).toEqual([])
  })
})

describe('ChatService two-stage runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a message turn without running the model', async () => {
    const settings = createClaudeSettings()
    const createAgentBackend = vi.fn(() =>
      createMockAgentBackend([{ type: 'text_delta', text: 'should not run' }])
    )
    const { messagesRepository, service } = createService({
      createAgentBackend,
      settings
    })

    const result = await service.createMessageTurn({ content: 'hello' })

    expect(createAgentBackend).not.toHaveBeenCalled()
    expect(result.operation.status).toBe('idle')
    expect(result.operation.appContext).toMatchObject({
      sessionId: result.session.id,
      llmConnectionBackend: 'anthropic'
    })
    expect(result.operation.appContext).not.toHaveProperty('llmConnectionId')
    expect(result.session.llmConnectionId).toBeNull()
    expect(result.assistantMessage.status).toBe('pending')
    expect(messagesRepository.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant'
    ])
  })

  it('returns a clear error when running an unknown operation', async () => {
    const settings = createClaudeSettings()
    const { service } = createService({ settings })

    await expect(service.runOperation({ operationId: 'missing-operation' })).rejects.toThrow(
      'Agent operation not found.'
    )
  })
})
