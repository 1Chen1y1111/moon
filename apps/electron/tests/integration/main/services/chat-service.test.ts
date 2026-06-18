// @vitest-environment node

/**
 * 负责验证 ChatService 与真实 PGlite repositories 的关键落库边界。
 * 测试只跑本地数据库，不访问真实模型 provider 或网络。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { bootstrapDatabase } from '@main/db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from '@main/db/connection'
import { AgentOperationsRepository } from '@main/repositories/agent-operations-repository'
import { MessagesRepository } from '@main/repositories/messages-repository'
import { SessionsRepository } from '@main/repositories/sessions-repository'
import { SettingsRepository } from '@main/repositories/settings-repository'
import { ThreadsRepository } from '@main/repositories/threads-repository'
import { ToolInvocationsRepository } from '@main/repositories/tool-invocations-repository'
import { TopicsRepository } from '@main/repositories/topics-repository'
import { ChatService } from '@main/services/chat-service'
import { SettingsService } from '@main/services/settings-service'
import type { AgentBackend, AgentBackendConfig } from '@moon/shared/agent'
import type { ProviderModel } from '@moon/shared/domain/provider'

const pgliteTestTimeout = 30_000

/**
 * 创建已完成迁移的测试数据库连接。
 */
async function createBootstrappedConnection(databasePath: string): Promise<AppDatabaseConnection> {
  const connection = await createDatabaseConnection(databasePath)

  await bootstrapDatabase(connection)

  return connection
}

/**
 * 创建不会被 createMessageTurn 调用的 agent backend 占位。
 */
function createUnusedAgentBackend(_config: AgentBackendConfig): AgentBackend {
  throw new Error('createMessageTurn should not create an agent backend.')
}

describe('ChatService integration', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it(
    'rejects DeepSeek provider fallback while Pi-compatible runtime is not wired',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-chat-service-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const settingsRepository = new SettingsRepository(connection)
      const sessionsRepository = new SessionsRepository(connection)
      const deepseekModel: ProviderModel = {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        enabled: true,
        isManual: false,
        providerApi: 'openai-completions',
        providerBaseUrl: 'https://api.deepseek.com'
      }
      const createAgentBackend = vi.fn(createUnusedAgentBackend)
      const service = new ChatService({
        agentOperationsRepository: new AgentOperationsRepository(connection),
        attachmentsDirectory: join(directoryPath, 'attachments'),
        createAgentBackend,
        messagesRepository: new MessagesRepository(connection),
        sessionsRepository,
        settingsRepository,
        threadsRepository: new ThreadsRepository(connection),
        toolInvocationsRepository: new ToolInvocationsRepository(connection),
        topicsRepository: new TopicsRepository(connection)
      })

      try {
        await settingsRepository.saveProvider('deepseek', {
          apiKey: 'sk-deepseek-demo',
          model: deepseekModel.id,
          models: [deepseekModel],
          availableModels: [deepseekModel],
          enabled: true
        })

        await expect(
          service.createMessageTurn({
            provider: 'deepseek',
            content: '你好'
          })
        ).rejects.toThrow('Pi backend is not wired yet')

        const sessions = await sessionsRepository.list()

        expect(sessions).toEqual([])
        expect(createAgentBackend).not.toHaveBeenCalled()
      } finally {
        await connection.close()
      }
    },
    pgliteTestTimeout
  )

  it(
    'does not synchronize OpenAI-compatible DeepSeek into a runnable LLM connection',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-chat-service-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const settingsRepository = new SettingsRepository(connection)
      const settingsService = new SettingsService(settingsRepository)
      const sessionsRepository = new SessionsRepository(connection)
      const deepseekModel: ProviderModel = {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        enabled: true,
        isManual: false,
        providerApi: 'openai-completions',
        providerBaseUrl: 'https://api.deepseek.com'
      }
      const createAgentBackend = vi.fn(createUnusedAgentBackend)
      const chatService = new ChatService({
        agentOperationsRepository: new AgentOperationsRepository(connection),
        attachmentsDirectory: join(directoryPath, 'attachments'),
        createAgentBackend,
        messagesRepository: new MessagesRepository(connection),
        sessionsRepository,
        settingsRepository,
        threadsRepository: new ThreadsRepository(connection),
        toolInvocationsRepository: new ToolInvocationsRepository(connection),
        topicsRepository: new TopicsRepository(connection)
      })

      try {
        await settingsService.saveProvider({
          provider: 'deepseek',
          apiKey: 'sk-deepseek-demo',
          model: deepseekModel.id,
          models: [deepseekModel],
          availableModels: [deepseekModel],
          enabled: true
        })

        const syncedConnection = await settingsRepository.findLlmConnectionById('deepseek')
        await expect(
          chatService.createMessageTurn({
            llmConnectionId: 'deepseek',
            content: '你好'
          })
        ).rejects.toThrow('LLM connection not found.')

        const sessions = await sessionsRepository.list()

        expect(syncedConnection).toBeNull()
        expect(sessions).toEqual([])
        expect(createAgentBackend).not.toHaveBeenCalled()
      } finally {
        await connection.close()
      }
    },
    pgliteTestTimeout
  )

  it(
    'keeps DeepSeek static models as Pi-compatible config without synchronizing a connection',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-chat-service-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const settingsRepository = new SettingsRepository(connection)
      const settingsService = new SettingsService(settingsRepository)
      const sessionsRepository = new SessionsRepository(connection)
      const createAgentBackend = vi.fn(createUnusedAgentBackend)
      const chatService = new ChatService({
        agentOperationsRepository: new AgentOperationsRepository(connection),
        attachmentsDirectory: join(directoryPath, 'attachments'),
        createAgentBackend,
        messagesRepository: new MessagesRepository(connection),
        sessionsRepository,
        settingsRepository,
        threadsRepository: new ThreadsRepository(connection),
        toolInvocationsRepository: new ToolInvocationsRepository(connection),
        topicsRepository: new TopicsRepository(connection)
      })

      try {
        await settingsService.saveProvider({
          provider: 'deepseek',
          apiKey: 'sk-deepseek-demo',
          enabled: true,
          models: [],
          availableModels: []
        })

        const settings = await settingsRepository.getSettings()
        const syncedConnection = await settingsRepository.findLlmConnectionById('deepseek')
        await expect(
          chatService.createMessageTurn({
            llmConnectionId: 'deepseek',
            content: '你好'
          })
        ).rejects.toThrow('LLM connection not found.')

        const sessions = await sessionsRepository.list()

        expect(settings.providers.deepseek).toMatchObject({
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          models: [
            {
              id: 'deepseek-v4-flash',
              enabled: true,
              isManual: false
            },
            {
              id: 'deepseek-v4-pro',
              enabled: false,
              isManual: false
            }
          ]
        })
        expect(syncedConnection).toBeNull()
        expect(sessions).toEqual([])
        expect(createAgentBackend).not.toHaveBeenCalled()
      } finally {
        await connection.close()
      }
    },
    pgliteTestTimeout
  )

  it(
    'synchronizes Anthropic-compatible DeepSeek into an executable LLM connection',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-chat-service-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const settingsRepository = new SettingsRepository(connection)
      const settingsService = new SettingsService(settingsRepository)
      const sessionsRepository = new SessionsRepository(connection)
      const deepseekModel: ProviderModel = {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        enabled: true,
        isManual: false,
        providerApi: 'openai-completions',
        providerBaseUrl: 'https://api.deepseek.com'
      }
      const createAgentBackend = vi.fn(createUnusedAgentBackend)
      const chatService = new ChatService({
        agentOperationsRepository: new AgentOperationsRepository(connection),
        attachmentsDirectory: join(directoryPath, 'attachments'),
        createAgentBackend,
        messagesRepository: new MessagesRepository(connection),
        sessionsRepository,
        settingsRepository,
        threadsRepository: new ThreadsRepository(connection),
        toolInvocationsRepository: new ToolInvocationsRepository(connection),
        topicsRepository: new TopicsRepository(connection)
      })

      try {
        await settingsService.saveProvider({
          provider: 'deepseek',
          apiKey: 'sk-deepseek-demo',
          apiFormat: 'anthropic',
          model: deepseekModel.id,
          models: [deepseekModel],
          availableModels: [deepseekModel],
          enabled: true
        })

        const syncedConnection = await settingsRepository.findLlmConnectionById('deepseek')
        const result = await chatService.createMessageTurn({
          llmConnectionId: 'deepseek',
          content: '你好'
        })
        const sessions = await sessionsRepository.list()

        expect(syncedConnection).toMatchObject({
          id: 'deepseek',
          providerId: 'deepseek',
          backend: 'anthropic',
          model: 'deepseek-v4-flash',
          baseUrl: 'https://api.deepseek.com/anthropic',
          enabled: true
        })
        expect(syncedConnection).not.toHaveProperty('customEndpoint')
        expect(result.session).toMatchObject({
          provider: 'deepseek',
          llmConnectionId: 'deepseek'
        })
        expect(result.operation.appContext).toMatchObject({
          sessionId: result.session.id,
          llmConnectionId: 'deepseek',
          llmConnectionBackend: 'anthropic'
        })
        expect(sessions).toEqual([
          expect.objectContaining({
            id: result.session.id,
            provider: 'deepseek',
            llmConnectionId: 'deepseek'
          })
        ])
        expect(createAgentBackend).not.toHaveBeenCalled()
      } finally {
        await connection.close()
      }
    },
    pgliteTestTimeout
  )

  it(
    'deletes sessions that have persisted agent operations',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-chat-service-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const settingsRepository = new SettingsRepository(connection)
      const settingsService = new SettingsService(settingsRepository)
      const sessionsRepository = new SessionsRepository(connection)
      const agentOperationsRepository = new AgentOperationsRepository(connection)
      const messagesRepository = new MessagesRepository(connection)
      const deepseekModel: ProviderModel = {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        enabled: true,
        isManual: false,
        providerApi: 'openai-completions',
        providerBaseUrl: 'https://api.deepseek.com'
      }
      const createAgentBackend = vi.fn(createUnusedAgentBackend)
      const chatService = new ChatService({
        agentOperationsRepository,
        attachmentsDirectory: join(directoryPath, 'attachments'),
        createAgentBackend,
        messagesRepository,
        sessionsRepository,
        settingsRepository,
        threadsRepository: new ThreadsRepository(connection),
        toolInvocationsRepository: new ToolInvocationsRepository(connection),
        topicsRepository: new TopicsRepository(connection)
      })

      try {
        await settingsService.saveProvider({
          provider: 'deepseek',
          apiKey: 'sk-deepseek-demo',
          apiFormat: 'anthropic',
          model: deepseekModel.id,
          models: [deepseekModel],
          availableModels: [deepseekModel],
          enabled: true
        })

        const result = await chatService.createMessageTurn({
          llmConnectionId: 'deepseek',
          content: '这条会话可以被删除'
        })

        await chatService.deleteSession({ sessionId: result.session.id })

        expect(await sessionsRepository.findById(result.session.id)).toBeNull()
        expect(await messagesRepository.listByOperation(result.operation.id)).toEqual([])
        expect(await agentOperationsRepository.findById(result.operation.id)).toMatchObject({
          id: result.operation.id,
          topicId: null,
          threadId: null
        })
      } finally {
        await connection.close()
      }
    },
    pgliteTestTimeout
  )
})
