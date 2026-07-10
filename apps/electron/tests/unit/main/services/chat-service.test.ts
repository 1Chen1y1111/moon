// @vitest-environment node

/**
 * 负责验证 server-core SessionManager 的会话编排和 agent 事件落库行为。
 * 测试使用内存仓储和 mock backend，不触发真实 SDK、Electron 或数据库。
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SessionManager,
  SessionScopedToolCallbackRegistry,
  type SessionPermissionModeResolver,
  type SessionSourceActivator,
  type SessionSourceProvider
} from '@moon/server-core/sessions'
import type {
  AgentOperationRecord,
  ChatOperationEvent,
  MessageRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { SessionRecord } from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import {
  createDefaultAppSettings,
  createDefaultProviderSettings
} from '@moon/shared/domain/settings'
import type { ProviderModel } from '@moon/shared/domain/provider'
import type { AppSettings, ProviderSettings } from '@moon/shared/domain/settings'
import type {
  AgentBackend,
  AgentBackendConfig,
  AgentChatOptions,
  AgentEvent,
  AgentPermissionDecision,
  AgentSourceRecord,
  MessageAttachment
} from '@moon/shared/agent'
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
 * 创建带 OpenAI-compatible 元数据的 DeepSeek 模型 fixture，模拟 provider 模型目录返回值。
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
 * 创建 provider 级 Anthropic 协议、模型级仍是 OpenAI-compatible 的 DeepSeek fixture。
 */
function createDeepSeekAnthropicProviderWithOpenAiModel(): ProviderSettings {
  const model = createDeepSeekOpenAiModel()

  return createProviderSettings({
    provider: 'deepseek',
    type: 'deepseek',
    apiFormat: 'anthropic',
    model: model.id,
    models: [model],
    availableModels: [model]
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

/**
 * 创建 DeepSeek OpenAI-compatible connection fixture。
 */
function createDeepSeekCompatConnection(
  input: Partial<NormalizedLlmConnection> = {}
): NormalizedLlmConnection {
  return llmConnectionSchema.parse({
    id: 'deepseek',
    name: 'DeepSeek',
    providerId: 'deepseek',
    backend: 'pi_compat',
    model: 'deepseek-v4-flash',
    apiKey: 'stored-connection-key',
    baseUrl: 'https://api.deepseek.com',
    customEndpoint: { api: 'openai-completions' },
    enabled: true,
    isDefault: false,
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

class ProjectsRepositoryMock {
  readonly projects: ProjectRecord[]
  private activeProjectId: string | null

  constructor(projects: ProjectRecord[] = [], activeProjectId: string | null = null) {
    this.projects = projects
    this.activeProjectId = activeProjectId
  }

  async list(): Promise<ProjectRecord[]> {
    return this.projects
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    return this.projects.find((project) => project.id === id) ?? null
  }

  async getActiveProject(): Promise<ProjectRecord | null> {
    return this.activeProjectId === null ? null : this.findById(this.activeProjectId)
  }

  async setActiveProjectId(projectId: string | null): Promise<void> {
    this.activeProjectId = projectId
  }
}

type CreateServiceResult = {
  agentOperationsRepository: AgentOperationsRepositoryMock
  createAgentBackend: ReturnType<typeof vi.fn>
  messagesRepository: MessagesRepositoryMock
  projectsRepository: ProjectsRepositoryMock
  service: SessionManager
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
    async *chat(): AsyncGenerator<AgentEvent, void, void> {
      for (const event of events) {
        yield event
      }
    },
    abort: vi.fn(async () => {}),
    destroy: vi.fn(),
    getModel: vi.fn(() => 'test-model'),
    isProcessing: vi.fn(() => false),
    respondToPermission: vi.fn(),
    setModel: vi.fn()
  }
}

/**
 * 创建会等待权限决策的 backend fixture，用来验证 SessionManager 能通过 respondToPermission 恢复执行。
 */
function createPermissionAgentBackend(
  decisions: AgentPermissionDecision[],
  options: {
    request?: Extract<AgentEvent, { type: 'permission_request' }>['request']
    throwWhenAborted?: boolean
  } = {}
): AgentBackend {
  let resolvePermission: ((decision: AgentPermissionDecision) => void) | null = null
  const respondToPermission = vi.fn(
    (requestId: string, allowed: boolean, alwaysAllow: boolean = false): void => {
      const decision: AgentPermissionDecision = allowed
        ? {
            requestId,
            approved: true,
            ...(alwaysAllow ? { alwaysAllow } : {})
          }
        : {
            requestId,
            approved: false
          }

      decisions.push(decision)
      resolvePermission?.(decision)
    }
  )

  return {
    async *chat(
      _message: string,
      _attachments?: MessageAttachment[],
      chatOptions?: AgentChatOptions
    ): AsyncGenerator<AgentEvent, void, void> {
      void _message
      void _attachments

      const permissionDecisionPromise = new Promise<AgentPermissionDecision>((resolve) => {
        resolvePermission = resolve
      })

      yield {
        type: 'permission_request',
        request: options.request ?? {
          requestId: 'permission-tool-1',
          toolName: 'Bash',
          description: '需要执行测试命令',
          command: 'pnpm test',
          type: 'bash',
          reason: '验证权限闭环'
        },
        ...(chatOptions?.turnId === undefined ? {} : { turnId: chatOptions.turnId })
      }
      const decision = await permissionDecisionPromise

      if (options.throwWhenAborted === true && chatOptions?.abortSignal?.aborted === true) {
        throw new Error('Cancelled by user.')
      }

      yield { type: 'text_delta', text: decision?.approved === true ? 'allowed' : 'rejected' }
    },
    abort: vi.fn(async () => {}),
    destroy: vi.fn(),
    getModel: vi.fn(() => 'test-model'),
    isProcessing: vi.fn(() => false),
    respondToPermission,
    setModel: vi.fn()
  }
}

/**
 * 创建固定返回 inactive source 的 provider fixture，便于验证 session runtime 是否会覆盖状态。
 */
function createInactiveSourceProvider(): SessionSourceProvider {
  return {
    resolveSources: vi.fn(async () => [
      {
        slug: 'linear',
        name: 'Linear',
        status: 'inactive' as const
      }
    ])
  }
}

/**
 * 创建首轮产出 source_activated、后续产出文本的 backend factory fixture。
 */
function createSourceActivationBackendFactory({
  capturedConfigs,
  originalMessage,
  retryText = 'retried',
  sourceSlug
}: {
  capturedConfigs: AgentBackendConfig[]
  originalMessage: string
  retryText?: string
  sourceSlug: string
}): ReturnType<typeof vi.fn> {
  let backendIndex = 0

  return vi.fn((config: AgentBackendConfig): AgentBackend => {
    capturedConfigs.push(config)
    backendIndex += 1
    const currentBackendIndex = backendIndex

    return {
      async *chat(
        _message: string,
        _attachments?: MessageAttachment[],
        options?: AgentChatOptions
      ): AsyncGenerator<AgentEvent, void, void> {
        void _message
        void _attachments

        if (currentBackendIndex === 1) {
          yield {
            type: 'source_activated',
            sourceSlug,
            originalMessage,
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
          return
        }

        yield {
          type: 'text_delta',
          text: retryText,
          ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
        }
      },
      abort: vi.fn(async () => {}),
      destroy: vi.fn(),
      getModel: vi.fn(() => 'test-model'),
      isProcessing: vi.fn(() => false),
      respondToPermission: vi.fn(),
      setModel: vi.fn()
    }
  })
}

function createService(input: {
  agentEvents?: AgentEvent[]
  attachmentsDirectory?: string
  createAgentBackend?: ReturnType<typeof vi.fn>
  activeProjectId?: string | null
  llmConnections?: NormalizedLlmConnection[]
  messages?: MessageRecord[]
  permissionModeResolver?: SessionPermissionModeResolver
  projects?: ProjectRecord[]
  sessions?: SessionRecord[]
  sourceActivator?: SessionSourceActivator
  sourceProvider?: SessionSourceProvider
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
  const projectsRepository = new ProjectsRepositoryMock(
    input.projects,
    input.activeProjectId ?? null
  )
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
    agentOperationsRepository,
    createAgentBackend,
    messagesRepository,
    service: new SessionManager({
      agentOperationsRepository: agentOperationsRepository as never,
      attachmentsDirectory: input.attachmentsDirectory,
      createAgentBackend: createAgentBackend as never,
      messagesRepository: messagesRepository as never,
      permissionModeResolver: input.permissionModeResolver,
      projectsRepository: projectsRepository as never,
      sessionsRepository: sessionsRepository as never,
      settingsRepository: settingsRepository as never,
      sourceActivator: input.sourceActivator,
      sourceProvider: input.sourceProvider,
      threadsRepository: threadsRepository as never,
      toolInvocationsRepository: toolInvocationsRepository as never,
      topicsRepository: topicsRepository as never
    }),
    sessionsRepository,
    projectsRepository,
    settingsRepository,
    toolInvocationsRepository
  }
}

describe('SessionScopedToolCallbackRegistry', () => {
  it('registers, merges, reads, and unregisters session callbacks', async () => {
    const registry = new SessionScopedToolCallbackRegistry()
    const inactiveCallback = vi.fn(async () => false)
    const activeCallback = vi.fn(async () => true)

    registry.register('session-1', {
      activateSourceInSessionFn: inactiveCallback
    })

    expect(await registry.get('session-1')?.activateSourceInSessionFn?.('workspace')).toBe(false)

    registry.merge('session-1', {
      activateSourceInSessionFn: activeCallback
    })

    expect(await registry.get('session-1')?.activateSourceInSessionFn?.('workspace')).toBe(true)

    registry.unregister('session-1')

    expect(registry.get('session-1')).toBeUndefined()
    expect(inactiveCallback).toHaveBeenCalledTimes(1)
    expect(activeCallback).toHaveBeenCalledTimes(1)
  })
})

describe('SessionManager provider resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects the first enabled supported Anthropic provider', async () => {
    const { selectDefaultChatProvider } = await import('@moon/server/services/chat-service')
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
    const { selectChatModel } = await import('@moon/server/services/chat-service')

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

describe('SessionManager.sendMessage', () => {
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

  it('binds new sessions to the active project and passes workspace to backend config', async () => {
    const project = {
      id: 'project-1',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service, sessionsRepository } = createService({
      activeProjectId: project.id,
      createAgentBackend,
      projects: [project],
      settings: createClaudeSettings()
    })

    const result = await service.sendMessage({ content: 'hello' })

    expect(sessionsRepository.sessions[0].projectId).toBe(project.id)
    expect(result.operation.appContext).toMatchObject({
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path
    })
    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: {
          name: project.name,
          path: project.path
        },
        permissionMode: 'ask'
      })
    )
  })

  it.each(['safe', 'allow-all'] as const)(
    'passes resolved %s permission mode to backend config',
    async (permissionMode) => {
      const project = {
        id: 'project-1',
        name: 'moon',
        path: '/workspace/moon',
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:00:00.000Z'
      }
      const permissionModeResolver: SessionPermissionModeResolver = {
        resolvePermissionMode: vi.fn(async (scope) => {
          expect(scope.project).toMatchObject({ id: project.id, path: project.path })
          expect(scope.session.projectId).toBe(project.id)
          expect(scope.topic.sessionId).toBe(scope.session.id)
          expect(scope.thread.topicId).toBe(scope.topic.id)

          return permissionMode
        })
      }
      const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
        void config
        return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
      })
      const { service } = createService({
        activeProjectId: project.id,
        createAgentBackend,
        permissionModeResolver,
        projects: [project],
        settings: createClaudeSettings()
      })

      await service.sendMessage({ content: 'hello' })

      expect(permissionModeResolver.resolvePermissionMode).toHaveBeenCalledTimes(1)
      expect(createAgentBackend).toHaveBeenCalledWith(
        expect.objectContaining({
          permissionMode
        })
      )
    }
  )

  it('passes sources resolved for the session scope to backend config', async () => {
    const project = {
      id: 'project-1',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const sources: AgentSourceRecord[] = [
      {
        slug: 'github',
        name: 'GitHub',
        description: 'GitHub repository context',
        status: 'active'
      }
    ]
    const sourceProvider: SessionSourceProvider = {
      resolveSources: vi.fn(async (scope) => {
        expect(scope.project).toMatchObject({ id: project.id, path: project.path })
        expect(scope.session.projectId).toBe(project.id)

        return sources
      })
    }
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service } = createService({
      activeProjectId: project.id,
      createAgentBackend,
      projects: [project],
      sourceProvider,
      settings: createClaudeSettings()
    })

    await service.sendMessage({ content: 'hello' })

    expect(sourceProvider.resolveSources).toHaveBeenCalledTimes(1)
    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        sources
      })
    )
  })

  it('passes project-bound history, workspace, and sources for prompt construction', async () => {
    const project: ProjectRecord = {
      id: 'project-prompt',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const session: SessionRecord = {
      id: 'session-prompt',
      projectId: project.id,
      provider: 'claude',
      title: 'Prompt contract',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const topicId = `topic-${session.id}`
    const threadId = `thread-${session.id}`
    const sources: AgentSourceRecord[] = [
      {
        slug: 'workspace',
        name: 'Workspace',
        description: 'Local workspace source',
        guidePath: '/workspace/moon/AGENTS.md',
        instructions: 'Claude-first only. Pi and MCP are deferred.',
        status: 'active'
      }
    ]
    const sourceProvider: SessionSourceProvider = {
      resolveSources: vi.fn(async (scope) => {
        expect(scope.project).toMatchObject({ id: project.id, path: project.path })
        expect(scope.session.projectId).toBe(project.id)

        return sources
      })
    }
    const capturedConfigs: AgentBackendConfig[] = []
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      capturedConfigs.push(config)

      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service } = createService({
      createAgentBackend,
      messages: [
        {
          id: 'message-system-1',
          sessionId: session.id,
          topicId,
          threadId,
          role: 'system',
          content: 'project system context',
          status: 'complete',
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:00:00.000Z'
        },
        {
          id: 'message-user-1',
          sessionId: session.id,
          topicId,
          threadId,
          role: 'user',
          content: 'previous question',
          status: 'complete',
          createdAt: '2026-05-09T00:00:01.000Z',
          updatedAt: '2026-05-09T00:00:01.000Z'
        },
        {
          id: 'message-assistant-1',
          sessionId: session.id,
          topicId,
          threadId,
          role: 'assistant',
          content: 'previous answer',
          status: 'complete',
          createdAt: '2026-05-09T00:00:02.000Z',
          updatedAt: '2026-05-09T00:00:02.000Z'
        }
      ],
      projects: [project],
      sessions: [session],
      sourceProvider,
      settings: createClaudeSettings()
    })

    await service.sendMessage({ sessionId: session.id, content: 'current question' })

    expect(sourceProvider.resolveSources).toHaveBeenCalledTimes(1)
    expect(capturedConfigs).toHaveLength(1)
    expect(capturedConfigs[0]).toMatchObject({
      messages: [
        { role: 'system', content: 'project system context' },
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
        { role: 'user', content: 'current question' }
      ],
      sources,
      workspace: {
        name: project.name,
        path: project.path
      }
    })
  })

  it('wires source activation requests to the session source activator', async () => {
    const project = {
      id: 'project-1',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const pendingRestarts: unknown[] = []
    let capturedBackend: AgentBackend | null = null
    const sourceActivator: SessionSourceActivator = {
      activateSource: vi.fn(async (scope, sourceSlug) => {
        expect(scope.project).toMatchObject({ id: project.id, path: project.path })
        expect(scope.session.projectId).toBe(project.id)
        expect(scope.topic.sessionId).toBe(scope.session.id)
        expect(scope.thread.topicId).toBe(scope.topic.id)
        expect(sourceSlug).toBe('workspace')

        return true
      })
    }
    const createAgentBackend = vi.fn((): AgentBackend => {
      const backend: AgentBackend = {
        async *chat(): AsyncGenerator<AgentEvent, void, void> {
          const activated = await backend.onSourceActivationRequest?.('workspace')

          yield { type: 'text_delta', text: activated === true ? 'activated' : 'inactive' }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn(),
        setPendingSourceActivationRestart: vi.fn((pending) => {
          pendingRestarts.push(pending)
        })
      }

      capturedBackend = backend

      return backend
    })
    const { service } = createService({
      activeProjectId: project.id,
      createAgentBackend,
      projects: [project],
      sourceActivator,
      settings: createClaudeSettings()
    })

    await service.sendMessage({ content: 'hello' })

    expect(sourceActivator.activateSource).toHaveBeenCalledTimes(1)
    expect(pendingRestarts).toEqual([{ sourceSlug: 'workspace', originalMessage: 'hello' }])
    expect(await capturedBackend?.onSourceActivationRequest?.('workspace')).toBe(false)
    expect(sourceActivator.activateSource).toHaveBeenCalledTimes(1)
  })

  it('does not write pending source activation when activation fails', async () => {
    const pendingRestarts: unknown[] = []
    const sourceActivator: SessionSourceActivator = {
      activateSource: vi.fn(async () => false)
    }
    const createAgentBackend = vi.fn((): AgentBackend => {
      const backend: AgentBackend = {
        async *chat(): AsyncGenerator<AgentEvent, void, void> {
          const activated = await backend.onSourceActivationRequest?.('workspace')

          yield { type: 'text_delta', text: activated === true ? 'activated' : 'inactive' }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn(),
        setPendingSourceActivationRestart: vi.fn((pending) => {
          pendingRestarts.push(pending)
        })
      }

      return backend
    })
    const { service } = createService({
      createAgentBackend,
      sourceActivator,
      settings: createClaudeSettings()
    })

    await service.sendMessage({ content: 'hello' })

    expect(sourceActivator.activateSource).toHaveBeenCalledTimes(1)
    expect(pendingRestarts).toEqual([])
  })

  it('does not write pending source activation when no activator is configured', async () => {
    const pendingRestarts: unknown[] = []
    const createAgentBackend = vi.fn((): AgentBackend => {
      const backend: AgentBackend = {
        async *chat(): AsyncGenerator<AgentEvent, void, void> {
          const activated = await backend.onSourceActivationRequest?.('workspace')

          yield { type: 'text_delta', text: activated === true ? 'activated' : 'inactive' }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn(),
        setPendingSourceActivationRestart: vi.fn((pending) => {
          pendingRestarts.push(pending)
        })
      }

      return backend
    })
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    await service.sendMessage({ content: 'hello' })

    expect(pendingRestarts).toEqual([])
  })

  it('does not request source activation when backend cannot record pending restart', async () => {
    let activationResult: boolean | undefined
    const sourceActivator: SessionSourceActivator = {
      activateSource: vi.fn(async () => true)
    }
    const createAgentBackend = vi.fn((): AgentBackend => {
      const backend: AgentBackend = {
        async *chat(): AsyncGenerator<AgentEvent, void, void> {
          activationResult = await backend.onSourceActivationRequest?.('workspace')

          yield { type: 'text_delta', text: activationResult === true ? 'activated' : 'inactive' }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      }

      return backend
    })
    const { service } = createService({
      createAgentBackend,
      sourceActivator,
      settings: createClaudeSettings()
    })

    await service.sendMessage({ content: 'hello' })

    expect(activationResult).toBe(false)
    expect(sourceActivator.activateSource).not.toHaveBeenCalled()
  })

  it('passes operation id as agent turn id when running a backend', async () => {
    const chatOptions: AgentChatOptions[] = []
    const createAgentBackend = vi.fn(
      (): AgentBackend => ({
        async *chat(
          _message: string,
          _attachments?: MessageAttachment[],
          options?: AgentChatOptions
        ): AsyncGenerator<AgentEvent, void, void> {
          void _message
          void _attachments
          chatOptions.push(options ?? {})
          yield { type: 'text_delta', text: 'ok' }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      })
    )
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const result = await service.sendMessage({ content: 'hello' })

    expect(chatOptions[0]).toMatchObject({ turnId: result.operation.id })
  })

  it('preserves turn id on message deltas and assistant message metadata', async () => {
    const events: unknown[] = []
    const createAgentBackend = vi.fn(
      (): AgentBackend => ({
        async *chat(
          _message: string,
          _attachments?: MessageAttachment[],
          options?: AgentChatOptions
        ): AsyncGenerator<AgentEvent, void, void> {
          void _message
          void _attachments
          yield {
            type: 'text_delta',
            text: 'ok',
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      })
    )
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const result = await service.sendMessage({ content: 'hello' }, (event) => events.push(event))
    const assistantMessage = result.messages.find((message) => message.role === 'assistant')
    const deltaEvent = events.find(
      (event): event is { type: 'message-delta'; turnId?: string } =>
        (event as { type?: string }).type === 'message-delta'
    )

    expect(assistantMessage?.metadata).toMatchObject({ agentTurnId: result.operation.id })
    expect(deltaEvent).toMatchObject({ turnId: result.operation.id })
  })

  it('preserves turn id on permission requests and permission resolution events', async () => {
    const settings = createClaudeSettings()
    const decisions: AgentPermissionDecision[] = []
    const events: unknown[] = []
    const agentBackend = createPermissionAgentBackend(decisions)
    const { service, toolInvocationsRepository } = createService({
      createAgentBackend: vi.fn(() => agentBackend),
      settings
    })

    const result = await service.sendMessage({ content: '需要工具权限' }, (event) => {
      events.push(event)

      if (event.type === 'tool-waiting-approval') {
        void service.approveToolCall({ toolInvocationId: event.toolInvocation.id })
      }
    })
    const waitingEvent = events.find(
      (event): event is { type: 'tool-waiting-approval'; turnId?: string } =>
        (event as { type?: string }).type === 'tool-waiting-approval'
    )
    const finishEvent = events.find(
      (event): event is { type: 'tool-finish'; turnId?: string } =>
        (event as { type?: string }).type === 'tool-finish'
    )

    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'permission-tool-1',
        state: { agentTurnId: result.operation.id },
        status: 'done'
      })
    ])
    expect(waitingEvent).toMatchObject({ turnId: result.operation.id })
    expect(finishEvent).toMatchObject({ turnId: result.operation.id })
  })

  it('preserves turn id on tool start and tool finish events', async () => {
    const events: unknown[] = []
    const createAgentBackend = vi.fn(
      (): AgentBackend => ({
        async *chat(
          _message: string,
          _attachments?: MessageAttachment[],
          options?: AgentChatOptions
        ): AsyncGenerator<AgentEvent, void, void> {
          void _message
          void _attachments
          yield {
            type: 'tool_start',
            toolUseId: 'tool-1',
            toolName: 'Read',
            input: { file_path: 'README.md' },
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
          yield {
            type: 'tool_result',
            toolUseId: 'tool-1',
            result: { output: 'hello' },
            isError: false,
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
          yield {
            type: 'text_delta',
            text: 'done',
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      })
    )
    const { service, toolInvocationsRepository } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const result = await service.sendMessage({ content: '跑工具' }, (event) => events.push(event))
    const startEvent = events.find(
      (event): event is { type: 'tool-start'; turnId?: string } =>
        (event as { type?: string }).type === 'tool-start'
    )
    const finishEvent = events.find(
      (event): event is { type: 'tool-finish'; turnId?: string } =>
        (event as { type?: string }).type === 'tool-finish'
    )

    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        state: { agentTurnId: result.operation.id },
        status: 'done'
      })
    ])
    expect(startEvent).toMatchObject({ turnId: result.operation.id })
    expect(finishEvent).toMatchObject({ turnId: result.operation.id })
  })

  it('passes source activation events through without creating records', async () => {
    const events: unknown[] = []
    const createAgentBackend = vi.fn(
      (): AgentBackend => ({
        async *chat(
          _message: string,
          _attachments?: MessageAttachment[],
          options?: AgentChatOptions
        ): AsyncGenerator<AgentEvent, void, void> {
          void _message
          void _attachments
          yield {
            type: 'source_activated',
            sourceSlug: 'workspace',
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
          yield {
            type: 'text_delta',
            text: 'done',
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      })
    )
    const { service, messagesRepository, toolInvocationsRepository } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const result = await service.sendMessage({ content: 'hello' }, (event) => events.push(event))
    const sourceEvent = events.find(
      (
        event
      ): event is {
        type: 'source-activated'
        sourceSlug: string
        originalMessage?: string
        turnId?: string
      } => (event as { type?: string }).type === 'source-activated'
    )

    expect(sourceEvent).toMatchObject({
      type: 'source-activated',
      sourceSlug: 'workspace',
      turnId: result.operation.id
    })
    expect(messagesRepository.messages).toHaveLength(2)
    expect(toolInvocationsRepository.invocations).toEqual([])
    expect(result.operation.status).toBe('done')
  })

  it('auto-retries in the same thread with the original message after source activation', async () => {
    const events: unknown[] = []
    const chatMessages: string[] = []
    let backendIndex = 0
    const createAgentBackend = vi.fn(
      (): AgentBackend => ({
        async *chat(
          message: string,
          _attachments?: MessageAttachment[],
          options?: AgentChatOptions
        ): AsyncGenerator<AgentEvent, void, void> {
          void _attachments
          chatMessages.push(message)
          backendIndex += 1

          if (backendIndex === 1) {
            yield {
              type: 'source_activated',
              sourceSlug: 'workspace',
              originalMessage: 'hello',
              ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
            }
            return
          }

          yield {
            type: 'text_delta',
            text: 'retried',
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      })
    )
    const { agentOperationsRepository, messagesRepository, service } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const result = await service.sendMessage({ content: 'hello' }, (event) => events.push(event))
    const sourceEvent = events.find(
      (
        event
      ): event is {
        type: 'source-activated'
        operationId: string
        sourceSlug: string
        originalMessage?: string
        turnId?: string
      } => (event as { type?: string }).type === 'source-activated'
    )

    expect(result.operation.status).toBe('done')
    expect(sourceEvent).toMatchObject({
      type: 'source-activated',
      operationId: result.operation.id,
      sourceSlug: 'workspace',
      originalMessage: 'hello',
      turnId: result.operation.id
    })
    expect(createAgentBackend).toHaveBeenCalledTimes(2)
    expect(chatMessages).toEqual(['hello', 'hello'])
    expect(agentOperationsRepository.operations.map((operation) => operation.status)).toEqual([
      'done',
      'done'
    ])
    expect(
      events.filter((event) => (event as { type?: string }).type === 'operation-done')
    ).toHaveLength(2)
    expect(messagesRepository.messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'hello'],
      ['assistant', ''],
      ['user', 'hello'],
      ['assistant', 'retried']
    ])
  })

  it('marks activated sources active for the next backend config in the same thread', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const sourceProvider = createInactiveSourceProvider()
    const createAgentBackend = createSourceActivationBackendFactory({
      capturedConfigs,
      originalMessage: 'hello',
      sourceSlug: 'linear'
    })
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings(),
      sourceProvider
    })

    await service.sendMessage({ content: 'hello' })

    expect(sourceProvider.resolveSources).toHaveBeenCalledTimes(2)
    expect(capturedConfigs).toHaveLength(2)
    expect(capturedConfigs[0]?.sources).toEqual([
      expect.objectContaining({ slug: 'linear', status: 'inactive' })
    ])
    expect(capturedConfigs[1]?.sources).toEqual([
      expect.objectContaining({ slug: 'linear', status: 'active' })
    ])
    expect(capturedConfigs[1]?.agentSessionState?.activatedSourceSlugs).toEqual(['linear'])
  })

  it('does not share activated sources across threads', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const sourceProvider = createInactiveSourceProvider()
    const createAgentBackend = createSourceActivationBackendFactory({
      capturedConfigs,
      originalMessage: '   ',
      retryText: 'other thread',
      sourceSlug: 'linear'
    })
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings(),
      sourceProvider
    })

    const firstResult = await service.sendMessage({ content: 'hello' })
    const secondTurn = await service.createMessageTurn({
      sessionId: firstResult.session.id,
      topicId: firstResult.topic.id,
      threadId: 'other-thread',
      content: 'hello from another thread'
    })

    await service.runOperation({ operationId: secondTurn.operation.id })

    expect(capturedConfigs).toHaveLength(2)
    expect(capturedConfigs[0]?.agentSessionState?.activatedSourceSlugs).toEqual(['linear'])
    expect(capturedConfigs[1]?.agentSessionState?.activatedSourceSlugs).toEqual([])
    expect(capturedConfigs[1]?.sources).toEqual([
      expect.objectContaining({ slug: 'linear', status: 'inactive' })
    ])
  })

  it('does not inject unknown activated sources into backend config', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const sourceProvider = createInactiveSourceProvider()
    const createAgentBackend = createSourceActivationBackendFactory({
      capturedConfigs,
      originalMessage: 'hello',
      sourceSlug: 'unknown'
    })
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings(),
      sourceProvider
    })

    await service.sendMessage({ content: 'hello' })

    expect(capturedConfigs).toHaveLength(2)
    expect(capturedConfigs[1]?.agentSessionState?.activatedSourceSlugs).toEqual(['unknown'])
    expect(capturedConfigs[1]?.sources).toEqual([
      expect.objectContaining({ slug: 'linear', status: 'inactive' })
    ])
    expect(capturedConfigs[1]?.sources?.some((source) => source.slug === 'unknown')).toBe(false)
  })

  it('does not auto-retry source activation when original message is blank', async () => {
    const events: unknown[] = []
    const createAgentBackend = vi.fn(
      (): AgentBackend => ({
        async *chat(
          _message: string,
          _attachments?: MessageAttachment[],
          options?: AgentChatOptions
        ): AsyncGenerator<AgentEvent, void, void> {
          void _message
          void _attachments
          yield {
            type: 'source_activated',
            sourceSlug: 'workspace',
            originalMessage: '   ',
            ...(options?.turnId === undefined ? {} : { turnId: options.turnId })
          }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      })
    )
    const { messagesRepository, service } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const result = await service.sendMessage({ content: 'hello' }, (event) => events.push(event))
    const assistantMessage = messagesRepository.messages.find(
      (message) => message.role === 'assistant'
    )

    expect(result.operation.status).toBe('done')
    expect(createAgentBackend).toHaveBeenCalledTimes(1)
    expect(messagesRepository.messages).toHaveLength(2)
    expect(assistantMessage).toMatchObject({ content: '', status: 'complete' })
    expect(
      events.filter((event) => (event as { type?: string }).type === 'source-activated')
    ).toHaveLength(1)
  })

  it('does not write empty turn metadata for events without turn id', async () => {
    const settings = createClaudeSettings()
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

    const result = await service.sendMessage({ content: '跑工具' })
    const assistantMessage = result.messages.find((message) => message.role === 'assistant')

    expect(assistantMessage?.metadata).toBeUndefined()
    expect(toolInvocationsRepository.invocations).toEqual([
      expect.not.objectContaining({
        state: expect.anything()
      })
    ])
  })

  it('passes Anthropic-compatible providers through Anthropic backend config', async () => {
    const openrouter = createAnthropicCompatibleProvider({
      provider: 'openrouter',
      type: 'openrouter',
      baseUrl: 'https://compat.example.com',
      defaultBaseUrl: 'https://compat.example.com',
      model: 'anthropic/claude-sonnet'
    })
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service } = createService({
      createAgentBackend,
      settings: createSettings([openrouter])
    })

    await service.sendMessage({ content: 'hello' })

    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        model: 'anthropic/claude-sonnet',
        apiKey: 'stored-key',
        baseUrl: 'https://compat.example.com'
      })
    )
    expect(createAgentBackend.mock.calls[0]?.[0]).not.toHaveProperty('customEndpoint')
  })

  it('rejects explicitly selected DeepSeek Pi-compatible providers while Pi is not wired', async () => {
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
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      settings: createSettings([deepseek])
    })

    await expect(service.sendMessage({ provider: 'deepseek', content: 'hello' })).rejects.toThrow(
      'Pi backend is not wired yet'
    )

    expect(sessionsRepository.sessions).toEqual([])
    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('passes DeepSeek Anthropic protocol providers through Claude SDK backend config', async () => {
    const deepseek = createDeepSeekAnthropicProviderWithOpenAiModel()
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service } = createService({
      createAgentBackend,
      settings: createSettings([deepseek])
    })

    await service.sendMessage({ content: 'hello' })

    expect(createAgentBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        model: 'deepseek-v4-flash',
        apiKey: 'stored-key',
        baseUrl: 'https://api.deepseek.com/anthropic'
      })
    )
    expect(createAgentBackend.mock.calls[0]?.[0]).not.toHaveProperty('customEndpoint')
  })

  it('rejects a requested provider bound to a Pi-compatible same-id connection', async () => {
    const deepseek = createProviderSettings({
      provider: 'deepseek',
      type: 'deepseek',
      model: 'deepseek-v4-flash'
    })
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      llmConnections: [createDeepSeekCompatConnection()],
      settings: createSettings([deepseek])
    })

    await expect(service.sendMessage({ provider: 'deepseek', content: 'hello' })).rejects.toThrow(
      'Pi backend is not wired yet'
    )

    expect(sessionsRepository.sessions).toEqual([])
    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('rejects an explicit provider-backed Pi-compatible LLM connection instead of refreshing it', async () => {
    const deepseek = createDeepSeekAnthropicProviderWithOpenAiModel()
    const createAgentBackend = vi.fn()
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      llmConnections: [createDeepSeekCompatConnection()],
      settings: createSettings([deepseek])
    })

    await expect(
      service.sendMessage({
        llmConnectionId: 'deepseek',
        provider: 'deepseek',
        content: 'hello'
      })
    ).rejects.toThrow('Pi backend is not wired yet')

    expect(sessionsRepository.sessions).toEqual([])
    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('rejects provider-backed Pi-compatible LLM connections when ids differ from provider id', async () => {
    const deepseek = createDeepSeekAnthropicProviderWithOpenAiModel()
    const createAgentBackend = vi.fn()
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      llmConnections: [
        createDeepSeekCompatConnection({
          id: 'deepseek-legacy',
          isDefault: true
        })
      ],
      settings: createSettings([deepseek])
    })

    await expect(
      service.sendMessage({
        llmConnectionId: 'deepseek-legacy',
        provider: 'deepseek',
        content: 'hello'
      })
    ).rejects.toThrow('Pi backend is not wired yet')

    expect(sessionsRepository.sessions).toEqual([])
    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('rejects an explicit Pi-compatible LLM connection before the requested provider', async () => {
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      llmConnections: [createDeepSeekCompatConnection()],
      settings: createClaudeSettings()
    })

    await expect(
      service.sendMessage({
        llmConnectionId: 'deepseek',
        provider: 'claude',
        content: 'hello'
      })
    ).rejects.toThrow('Pi backend is not wired yet')

    expect(sessionsRepository.sessions).toEqual([])
    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('rejects a persisted default Pi-compatible LLM connection before provider fallback', async () => {
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service, sessionsRepository } = createService({
      createAgentBackend,
      llmConnections: [createAnthropicCompatConnection()],
      settings: createDefaultAppSettings()
    })

    await expect(service.sendMessage({ content: 'hello' })).rejects.toThrow(
      'Pi backend is not wired yet'
    )

    expect(sessionsRepository.sessions).toEqual([])
    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('rejects a session Pi-compatible LLM connection for follow-up turns', async () => {
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
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      void config
      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service } = createService({
      createAgentBackend,
      llmConnections: [createAnthropicCompatConnection({ isDefault: false })],
      sessions: [session],
      settings: createClaudeSettings()
    })

    await expect(
      service.sendMessage({ sessionId: 'session-1', content: 'continue' })
    ).rejects.toThrow('Pi backend is not wired yet')

    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('rejects a session provider-backed Pi-compatible LLM connection instead of refreshing it', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      llmConnectionId: 'deepseek',
      projectId: null,
      provider: 'deepseek',
      title: 'Plan',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const deepseek = createDeepSeekAnthropicProviderWithOpenAiModel()
    const createAgentBackend = vi.fn()
    const { service } = createService({
      createAgentBackend,
      llmConnections: [createDeepSeekCompatConnection()],
      sessions: [session],
      settings: createSettings([deepseek])
    })

    await expect(
      service.sendMessage({ sessionId: 'session-1', content: 'continue' })
    ).rejects.toThrow('Pi backend is not wired yet')

    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('rejects a legacy session Pi-compatible LLM connection without providerId', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      llmConnectionId: 'deepseek-legacy',
      projectId: null,
      provider: 'deepseek',
      title: 'Plan',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const deepseek = createDeepSeekAnthropicProviderWithOpenAiModel()
    const createAgentBackend = vi.fn()
    const { service } = createService({
      createAgentBackend,
      llmConnections: [
        createDeepSeekCompatConnection({
          id: 'deepseek-legacy',
          providerId: undefined
        })
      ],
      sessions: [session],
      settings: createSettings([deepseek])
    })

    await expect(
      service.sendMessage({ sessionId: 'session-1', content: 'continue' })
    ).rejects.toThrow('Pi backend is not wired yet')

    expect(createAgentBackend).not.toHaveBeenCalled()
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

  it('maps reasoning deltas and text_complete events to message state and renderer events', async () => {
    const settings = createClaudeSettings()
    const events: ChatOperationEvent[] = []
    const { messagesRepository, service } = createService({
      settings,
      agentEvents: [
        { type: 'reasoning_delta', text: 'thinking' },
        { type: 'text_complete', text: 'final answer' }
      ]
    })

    const result = await service.sendMessage({ content: '测试 complete text' }, (event) =>
      events.push(event)
    )
    const assistantMessage = messagesRepository.messages.find(
      (message) => message.role === 'assistant'
    )

    expect(result.messages.map((message) => message.content)).toEqual([
      '测试 complete text',
      'final answer'
    ])
    expect(assistantMessage).toMatchObject({
      content: 'final answer',
      reasoning: 'thinking',
      status: 'complete'
    })
    expect(events.map((event) => event.type)).toEqual([
      'message-created',
      'message-created',
      'operation-started',
      'reasoning-delta',
      'message-delta',
      'operation-done'
    ])
  })

  it('persists provider session ids and usage updates on operations', async () => {
    const settings = createClaudeSettings()
    const capturedConfigs: AgentBackendConfig[] = []
    const agentEvents: AgentEvent[] = [
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
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      capturedConfigs.push(config)

      return createMockAgentBackend(agentEvents)
    })
    const { service } = createService({
      createAgentBackend,
      settings
    })

    const result = await service.sendMessage({ content: '测试 usage' })
    await service.sendMessage({
      content: '测试 resume',
      sessionId: result.session.id,
      topicId: result.topic.id,
      threadId: result.thread.id
    })

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
    expect(capturedConfigs).toHaveLength(2)
    expect(capturedConfigs[1]?.agentSessionState?.providerSessionId).toBe('sdk-session-1')
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

  it('persists errored tool_result events on tool invocations', async () => {
    const settings = createClaudeSettings()
    const events: ChatOperationEvent[] = []
    const { service, toolInvocationsRepository } = createService({
      settings,
      agentEvents: [
        {
          type: 'tool_start',
          toolUseId: 'tool-error',
          toolName: 'Bash',
          input: { command: 'exit 1' }
        },
        {
          type: 'tool_result',
          toolUseId: 'tool-error',
          toolName: 'Bash',
          result: 'command failed',
          isError: true
        },
        { type: 'text_delta', text: 'handled' }
      ]
    })

    await service.sendMessage({ content: '跑失败工具' }, (event) => events.push(event))
    const finishEvent = events.find(
      (event): event is Extract<ChatOperationEvent, { type: 'tool-finish' }> =>
        event.type === 'tool-finish'
    )

    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'tool-error',
        name: 'Bash',
        arguments: { command: 'exit 1' },
        error: 'command failed',
        result: null,
        status: 'error'
      })
    ])
    expect(finishEvent?.toolInvocation).toMatchObject({
      id: 'tool-error',
      error: 'command failed',
      result: null,
      status: 'error'
    })
  })

  it('maps streaming cancellation to interrupted operation and cancelled assistant message', async () => {
    const settings = createClaudeSettings()
    const events: ChatOperationEvent[] = []
    let observedAbortSignal: AbortSignal | undefined
    const createAgentBackend = vi.fn(
      (): AgentBackend => ({
        async *chat(
          _message: string,
          _attachments?: MessageAttachment[],
          options?: AgentChatOptions
        ): AsyncGenerator<AgentEvent, void, void> {
          void _message
          void _attachments
          observedAbortSignal = options?.abortSignal

          yield { type: 'text_delta', text: 'partial ' }

          if (options?.abortSignal?.aborted === true) {
            throw new Error('Cancelled by user.')
          }

          yield { type: 'text_delta', text: 'should not continue' }
        },
        abort: vi.fn(async () => {}),
        destroy: vi.fn(),
        getModel: vi.fn(() => 'test-model'),
        isProcessing: vi.fn(() => false),
        respondToPermission: vi.fn(),
        setModel: vi.fn()
      })
    )
    const { agentOperationsRepository, messagesRepository, service } = createService({
      createAgentBackend,
      settings
    })

    await expect(
      service.sendMessage({ content: '取消 streaming' }, (event) => {
        events.push(event)

        if (event.type === 'message-delta') {
          void service.cancelOperation({ operationId: event.operationId })
        }
      })
    ).rejects.toThrow('Cancelled by user.')

    expect(observedAbortSignal?.aborted).toBe(true)
    expect(events.map((event) => event.type)).toEqual([
      'message-created',
      'message-created',
      'operation-started',
      'message-delta',
      'operation-error'
    ])
    expect(events.map((event) => event.type)).not.toContain('operation-done')
    expect(
      messagesRepository.messages.find((message) => message.role === 'assistant')
    ).toMatchObject({
      content: 'partial ',
      error: 'Cancelled by user.',
      status: 'cancelled'
    })
    expect(agentOperationsRepository.operations[0]).toMatchObject({
      error: null,
      completionReason: 'interrupted',
      status: 'interrupted'
    })
  })

  it('keeps completed operations unchanged when cancellation arrives late', async () => {
    const settings = createClaudeSettings()
    const { agentOperationsRepository, messagesRepository, service } = createService({
      settings,
      agentEvents: [{ type: 'text_delta', text: 'done' }]
    })

    const result = await service.sendMessage({ content: '已经完成' })
    const cancelledResult = await service.cancelOperation({ operationId: result.operation.id })

    expect(cancelledResult).toMatchObject({
      id: result.operation.id,
      completionReason: 'done',
      status: 'done'
    })
    expect(agentOperationsRepository.operations[0]).toMatchObject({
      completionReason: 'done',
      status: 'done'
    })
    expect(
      messagesRepository.messages.find((message) => message.role === 'assistant')
    ).toMatchObject({
      content: 'done',
      error: null,
      status: 'complete'
    })
  })

  it('maps typed_error events to operation and message error state', async () => {
    const settings = createClaudeSettings()
    const events: ChatOperationEvent[] = []
    const { agentOperationsRepository, messagesRepository, service } = createService({
      settings,
      agentEvents: [
        {
          type: 'typed_error',
          error: {
            code: 'claude_auth_status_error',
            title: 'Claude auth failed',
            message: 'login expired',
            canRetry: true
          }
        }
      ]
    })

    await expect(
      service.sendMessage({ content: '测试 typed error' }, (event) => events.push(event))
    ).rejects.toThrow('login expired')

    expect(events.map((event) => event.type)).toEqual([
      'message-created',
      'message-created',
      'operation-started',
      'operation-error'
    ])
    expect(
      messagesRepository.messages.find((message) => message.role === 'assistant')
    ).toMatchObject({
      error: 'login expired',
      status: 'error'
    })
    expect(agentOperationsRepository.operations[0]).toMatchObject({
      error: { message: 'login expired' },
      completionReason: 'error',
      status: 'error'
    })
  })

  it('rejects command-like requests for Pi-compatible connections before backend creation', async () => {
    const project: ProjectRecord = {
      id: 'project-1',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const createAgentBackend = vi.fn()
    const { service } = createService({
      activeProjectId: project.id,
      createAgentBackend,
      llmConnections: [createDeepSeekCompatConnection({ isDefault: true })],
      projects: [project],
      settings: createSettings([
        createProviderSettings({
          provider: 'deepseek',
          type: 'deepseek',
          model: 'deepseek-v4-flash'
        })
      ])
    })

    await expect(service.sendMessage({ content: '运行 pwd' })).rejects.toThrow(
      'Pi backend is not wired yet'
    )

    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('keeps legacy Anthropic Messages Pi-compatible connections unavailable during provider refresh', async () => {
    const project: ProjectRecord = {
      id: 'project-1',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const createAgentBackend = vi.fn()
    const { service } = createService({
      activeProjectId: project.id,
      createAgentBackend,
      llmConnections: [createAnthropicCompatConnection()],
      projects: [project],
      settings: createSettings([createAnthropicCompatibleProvider({ provider: 'openrouter' })])
    })

    await expect(service.sendMessage({ content: '运行 pwd' })).rejects.toThrow(
      'Pi backend is not wired yet'
    )

    expect(createAgentBackend).not.toHaveBeenCalled()
  })

  it('waits for permission approval and resumes the backend through respondToPermission', async () => {
    const settings = createClaudeSettings()
    const decisions: AgentPermissionDecision[] = []
    const events: unknown[] = []
    const agentBackend = createPermissionAgentBackend(decisions)
    const { service, toolInvocationsRepository } = createService({
      createAgentBackend: vi.fn(() => agentBackend),
      settings
    })

    const result = await service.sendMessage({ content: '需要工具权限' }, (event) => {
      events.push(event)

      if (event.type === 'tool-waiting-approval') {
        void service.approveToolCall({ toolInvocationId: event.toolInvocation.id })
      }
    })

    expect(decisions).toEqual([{ requestId: 'permission-tool-1', approved: true }])
    expect(agentBackend.respondToPermission).toHaveBeenCalledWith('permission-tool-1', true, false)
    expect(result.messages.map((message) => message.content)).toEqual(['需要工具权限', 'allowed'])
    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'permission-tool-1',
        name: 'Bash',
        arguments: expect.objectContaining({
          command: 'pnpm test',
          description: '需要执行测试命令'
        }),
        result: { approved: true },
        status: 'done'
      })
    ])
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      'message-created',
      'message-created',
      'operation-started',
      'tool-waiting-approval',
      'tool-finish',
      'message-delta',
      'operation-done'
    ])
  })

  it('passes alwaysAllow permission approvals through respondToPermission', async () => {
    const settings = createClaudeSettings()
    const decisions: AgentPermissionDecision[] = []
    const agentBackend = createPermissionAgentBackend(decisions)
    const { service, toolInvocationsRepository } = createService({
      createAgentBackend: vi.fn(() => agentBackend),
      settings
    })

    await service.sendMessage({ content: '始终允许这个工具' }, (event) => {
      if (event.type === 'tool-waiting-approval') {
        void service.approveToolCall({
          toolInvocationId: event.toolInvocation.id,
          alwaysAllow: true
        })
      }
    })

    expect(decisions).toEqual([
      { requestId: 'permission-tool-1', approved: true, alwaysAllow: true }
    ])
    expect(agentBackend.respondToPermission).toHaveBeenCalledWith('permission-tool-1', true, true)
    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'permission-tool-1',
        result: { approved: true },
        status: 'done'
      })
    ])
  })

  it('reuses agent session runtime state across operations in the same thread', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      capturedConfigs.push(config)

      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const firstResult = await service.sendMessage({ content: 'first message' })
    await service.sendMessage({
      sessionId: firstResult.session.id,
      topicId: firstResult.topic.id,
      threadId: firstResult.thread.id,
      content: 'second message'
    })

    expect(capturedConfigs).toHaveLength(2)
    expect(capturedConfigs[0]?.agentSessionState).toBeDefined()
    expect(capturedConfigs[1]?.agentSessionState).toBe(capturedConfigs[0]?.agentSessionState)
  })

  it('does not share agent session runtime state across different threads', async () => {
    const capturedConfigs: AgentBackendConfig[] = []
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      capturedConfigs.push(config)

      return createMockAgentBackend([{ type: 'text_delta', text: 'ok' }])
    })
    const { service } = createService({
      createAgentBackend,
      settings: createClaudeSettings()
    })

    const firstResult = await service.sendMessage({ content: 'first message' })
    const secondTurn = await service.createMessageTurn({
      sessionId: firstResult.session.id,
      topicId: firstResult.topic.id,
      threadId: 'new-thread',
      content: 'second message'
    })

    await service.runOperation({ operationId: secondTurn.operation.id })

    expect(capturedConfigs).toHaveLength(2)
    expect(capturedConfigs[0]?.agentSessionState).toBeDefined()
    expect(capturedConfigs[1]?.agentSessionState).toBeDefined()
    expect(capturedConfigs[1]?.agentSessionState).not.toBe(capturedConfigs[0]?.agentSessionState)
  })

  it('persists file write permission metadata for the approval card', async () => {
    const settings = createClaudeSettings()
    const decisions: AgentPermissionDecision[] = []
    const agentBackend = createPermissionAgentBackend(decisions, {
      request: {
        requestId: 'permission-edit-1',
        toolName: 'Edit',
        description: '需要修改项目文件：README.md',
        path: 'README.md',
        type: 'file_write',
        impact: '写操作会改变当前项目工作区文件。'
      }
    })
    const { service, toolInvocationsRepository } = createService({
      createAgentBackend: vi.fn(() => agentBackend),
      settings
    })

    await service.sendMessage({ content: '修改 README' }, (event) => {
      if (event.type === 'tool-waiting-approval') {
        void service.approveToolCall({ toolInvocationId: event.toolInvocation.id })
      }
    })

    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'permission-edit-1',
        name: 'Edit',
        arguments: expect.objectContaining({
          description: '需要修改项目文件：README.md',
          path: 'README.md',
          type: 'file_write',
          impact: '写操作会改变当前项目工作区文件。'
        }),
        intervention: expect.objectContaining({
          type: 'permission_request',
          description: '需要修改项目文件：README.md',
          path: 'README.md',
          impact: '写操作会改变当前项目工作区文件。'
        })
      })
    ])
  })

  it('sends rejected permission decisions back through respondToPermission', async () => {
    const settings = createClaudeSettings()
    const decisions: AgentPermissionDecision[] = []
    const events: ChatOperationEvent[] = []
    const agentBackend = createPermissionAgentBackend(decisions)
    const { service, toolInvocationsRepository } = createService({
      createAgentBackend: vi.fn(() => agentBackend),
      settings
    })

    const result = await service.sendMessage({ content: '拒绝工具权限' }, (event) => {
      events.push(event)

      if (event.type === 'tool-waiting-approval') {
        void service.rejectToolCall({
          toolInvocationId: event.toolInvocation.id,
          reason: '不允许执行测试命令'
        })
      }
    })

    expect(decisions).toEqual([{ requestId: 'permission-tool-1', approved: false }])
    expect(agentBackend.respondToPermission).toHaveBeenCalledWith('permission-tool-1', false, false)
    expect(result.messages.map((message) => message.content)).toEqual(['拒绝工具权限', 'rejected'])
    expect(events.map((event) => event.type)).toEqual([
      'message-created',
      'message-created',
      'operation-started',
      'tool-waiting-approval',
      'tool-finish',
      'message-delta',
      'operation-done'
    ])
    expect(
      events.find(
        (event): event is Extract<ChatOperationEvent, { type: 'tool-finish' }> =>
          event.type === 'tool-finish'
      )?.toolInvocation
    ).toMatchObject({
      id: 'permission-tool-1',
      error: '不允许执行测试命令',
      status: 'rejected'
    })
    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'permission-tool-1',
        error: '不允许执行测试命令',
        result: null,
        status: 'rejected'
      })
    ])
  })

  it('rejects pending permissions when cancelling an operation', async () => {
    const settings = createClaudeSettings()
    const decisions: AgentPermissionDecision[] = []
    const events: ChatOperationEvent[] = []
    const agentBackend = createPermissionAgentBackend(decisions, { throwWhenAborted: true })
    const { agentOperationsRepository, service, toolInvocationsRepository } = createService({
      createAgentBackend: vi.fn(() => agentBackend),
      settings
    })

    await expect(
      service.sendMessage({ content: '取消工具权限' }, (event) => {
        events.push(event)

        if (event.type === 'tool-waiting-approval') {
          void service.cancelOperation({ operationId: event.operationId })
        }
      })
    ).rejects.toThrow('Cancelled by user.')

    expect(decisions).toEqual([{ requestId: 'permission-tool-1', approved: false }])
    expect(agentBackend.respondToPermission).toHaveBeenCalledWith('permission-tool-1', false, false)
    expect(agentBackend.respondToPermission).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.type)).toEqual([
      'message-created',
      'message-created',
      'operation-started',
      'tool-waiting-approval',
      'operation-error'
    ])
    expect(agentOperationsRepository.operations[0]).toMatchObject({
      error: null,
      completionReason: 'interrupted',
      status: 'interrupted'
    })
    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'permission-tool-1',
        error: 'Cancelled by user.',
        result: null,
        status: 'rejected'
      })
    ])

    const eventCountAfterCancel = events.length
    const approvalAfterCancel = await service.approveToolCall({
      toolInvocationId: 'permission-tool-1'
    })

    expect(approvalAfterCancel).toMatchObject({
      id: 'permission-tool-1',
      status: 'rejected'
    })
    expect(agentBackend.respondToPermission).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(eventCountAfterCancel)
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

describe('SessionManager.deleteSession', () => {
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

describe('SessionManager two-stage operations', () => {
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

  it('runs a project-bound two-stage Claude main chain acceptance loop', async () => {
    const project: ProjectRecord = {
      id: 'project-main-chain',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const sources: AgentSourceRecord[] = [
      {
        slug: 'workspace',
        name: 'Workspace',
        description: 'Local workspace source',
        guidePath: '/workspace/moon/AGENTS.md',
        instructions: 'Claude-first only. Pi and MCP are deferred.',
        status: 'active'
      }
    ]
    const sourceProvider: SessionSourceProvider = {
      resolveSources: vi.fn(async (scope) => {
        expect(scope.project).toMatchObject({ id: project.id, path: project.path })
        expect(scope.session.projectId).toBe(project.id)

        return sources
      })
    }
    const capturedConfigs: AgentBackendConfig[] = []
    const chatCalls: Array<{ message: string; options?: AgentChatOptions }> = []
    const permissionDecisions: AgentPermissionDecision[] = []
    let resolvePermission: ((decision: AgentPermissionDecision) => void) | null = null
    const respondToPermission = vi.fn(
      (requestId: string, allowed: boolean, alwaysAllow: boolean = false): void => {
        const decision: AgentPermissionDecision = allowed
          ? {
              requestId,
              approved: true,
              ...(alwaysAllow ? { alwaysAllow } : {})
            }
          : {
              requestId,
              approved: false
            }

        permissionDecisions.push(decision)
        resolvePermission?.(decision)
      }
    )
    const agentBackend: AgentBackend = {
      async *chat(
        message: string,
        _attachments?: MessageAttachment[],
        options?: AgentChatOptions
      ): AsyncGenerator<AgentEvent, void, void> {
        void _attachments

        chatCalls.push({ message, options })
        const turnId = options?.turnId
        const withTurnId = turnId === undefined ? {} : { turnId }
        const permissionDecisionPromise = new Promise<AgentPermissionDecision>((resolve) => {
          resolvePermission = resolve
        })

        yield { type: 'text_delta', text: 'hello ', ...withTurnId }
        yield { type: 'reasoning_delta', text: 'thinking ', ...withTurnId }
        yield {
          type: 'tool_start',
          toolUseId: 'tool-read-agents',
          toolName: 'Read',
          input: { file_path: '/workspace/moon/AGENTS.md' },
          ...withTurnId
        }
        yield {
          type: 'tool_result',
          toolUseId: 'tool-read-agents',
          toolName: 'Read',
          input: { file_path: '/workspace/moon/AGENTS.md' },
          result: 'loaded AGENTS.md',
          isError: false,
          ...withTurnId
        }
        yield {
          type: 'permission_request',
          request: {
            requestId: 'permission-bash-test',
            toolName: 'Bash',
            description: '需要运行 focused test',
            command:
              'pnpm --filter @moon/electron exec vitest run tests/unit/main/services/chat-service.test.ts',
            type: 'bash',
            reason: '验证 Claude 主链路权限闭环'
          },
          ...withTurnId
        }

        const decision = await permissionDecisionPromise

        yield {
          type: 'text_delta',
          text: decision.approved ? 'world' : 'blocked',
          ...withTurnId
        }
        yield { type: 'source_activated', sourceSlug: 'workspace', ...withTurnId }
        yield { type: 'complete' }
      },
      abort: vi.fn(async () => {}),
      destroy: vi.fn(),
      getModel: vi.fn(() => 'claude-sonnet-4-5'),
      isProcessing: vi.fn(() => false),
      respondToPermission,
      setModel: vi.fn()
    }
    const createAgentBackend = vi.fn((config: AgentBackendConfig) => {
      capturedConfigs.push(config)

      return agentBackend
    })
    const { agentOperationsRepository, messagesRepository, service, toolInvocationsRepository } =
      createService({
        activeProjectId: project.id,
        createAgentBackend,
        projects: [project],
        sourceProvider,
        settings: createClaudeSettings()
      })

    const turn = await service.createMessageTurn({ content: 'build main chain' })

    expect(createAgentBackend).not.toHaveBeenCalled()
    expect(turn.session.projectId).toBe(project.id)
    expect(turn.operation.status).toBe('idle')

    const events: ChatOperationEvent[] = []
    const result = await service.runOperation({ operationId: turn.operation.id }, (event) => {
      events.push(event)

      if (event.type === 'tool-waiting-approval') {
        void service.approveToolCall({ toolInvocationId: event.toolInvocation.id })
      }
    })

    expect(sourceProvider.resolveSources).toHaveBeenCalledTimes(1)
    expect(capturedConfigs).toHaveLength(1)
    expect(capturedConfigs[0]).toMatchObject({
      apiKey: 'stored-key',
      baseUrl: 'https://api.anthropic.com',
      messages: [{ role: 'user', content: 'build main chain' }],
      model: 'claude-sonnet-4-5',
      permissionMode: 'ask',
      provider: 'anthropic',
      sources,
      workspace: {
        name: project.name,
        path: project.path
      }
    })
    expect(chatCalls).toEqual([
      expect.objectContaining({
        message: 'build main chain',
        options: expect.objectContaining({
          turnId: turn.operation.id,
          abortSignal: expect.any(AbortSignal)
        })
      })
    ])
    expect(events.map((event) => event.type)).toEqual([
      'operation-started',
      'message-delta',
      'reasoning-delta',
      'tool-start',
      'tool-finish',
      'tool-waiting-approval',
      'tool-finish',
      'message-delta',
      'source-activated',
      'operation-done'
    ])
    expect(events.filter((event) => 'turnId' in event).map((event) => event.turnId)).toEqual([
      turn.operation.id,
      turn.operation.id,
      turn.operation.id,
      turn.operation.id,
      turn.operation.id,
      turn.operation.id,
      turn.operation.id,
      turn.operation.id
    ])
    expect(permissionDecisions).toEqual([{ requestId: 'permission-bash-test', approved: true }])
    expect(respondToPermission).toHaveBeenCalledWith('permission-bash-test', true, false)

    const assistantMessage = messagesRepository.messages.find(
      (message) => message.role === 'assistant'
    )
    expect(assistantMessage).toMatchObject({
      content: 'hello world',
      reasoning: 'thinking ',
      status: 'complete'
    })
    expect(toolInvocationsRepository.invocations).toEqual([
      expect.objectContaining({
        id: 'tool-read-agents',
        arguments: { file_path: '/workspace/moon/AGENTS.md' },
        result: { value: 'loaded AGENTS.md' },
        status: 'done'
      }),
      expect.objectContaining({
        id: 'permission-bash-test',
        result: { approved: true },
        status: 'done'
      })
    ])
    expect(
      agentOperationsRepository.operations.find((operation) => operation.id === turn.operation.id)
    ).toMatchObject({
      status: 'done',
      completionReason: 'done',
      humanInterventions: 1
    })
    expect(result.operation).toMatchObject({
      id: turn.operation.id,
      status: 'done',
      completionReason: 'done'
    })
  })

  it('maps two-stage backend errors to operation and message error state', async () => {
    const settings = createClaudeSettings()
    const createAgentBackend = vi.fn(() =>
      createMockAgentBackend([{ type: 'error', message: 'backend failed' }])
    )
    const { agentOperationsRepository, messagesRepository, service } = createService({
      createAgentBackend,
      settings
    })
    const turn = await service.createMessageTurn({ content: 'fail main chain' })
    const events: ChatOperationEvent[] = []

    await expect(
      service.runOperation({ operationId: turn.operation.id }, (event) => events.push(event))
    ).rejects.toThrow('backend failed')

    expect(events.map((event) => event.type)).toEqual(['operation-started', 'operation-error'])
    expect(
      messagesRepository.messages.find((message) => message.role === 'assistant')
    ).toMatchObject({
      error: 'backend failed',
      status: 'error'
    })
    expect(
      agentOperationsRepository.operations.find((operation) => operation.id === turn.operation.id)
    ).toMatchObject({
      error: { message: 'backend failed' },
      completionReason: 'error',
      status: 'error'
    })
  })

  it('returns a clear error when running an unknown operation', async () => {
    const settings = createClaudeSettings()
    const { service } = createService({ settings })

    await expect(service.runOperation({ operationId: 'missing-operation' })).rejects.toThrow(
      'Agent operation not found.'
    )
  })
})
