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
    'creates a DeepSeek provider fallback turn without writing a missing LLM connection foreign key',
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
      const service = new ChatService({
        agentOperationsRepository: new AgentOperationsRepository(connection),
        attachmentsDirectory: join(directoryPath, 'attachments'),
        createAgentBackend: vi.fn(createUnusedAgentBackend),
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

        const result = await service.createMessageTurn({
          provider: 'deepseek',
          content: '你好'
        })
        const sessions = await sessionsRepository.list()

        expect(result.session).toMatchObject({
          provider: 'deepseek',
          llmConnectionId: null
        })
        expect(result.operation.appContext).toMatchObject({
          sessionId: result.session.id,
          llmConnectionBackend: 'pi_compat'
        })
        expect(result.operation.appContext).not.toHaveProperty('llmConnectionId')
        expect(sessions).toEqual([
          expect.objectContaining({
            id: result.session.id,
            provider: 'deepseek',
            llmConnectionId: null
          })
        ])
      } finally {
        await connection.close()
      }
    },
    pgliteTestTimeout
  )
})
