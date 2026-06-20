/**
 * 负责组合 Moon headless/server 侧本地数据库、repositories 和 ChatService。
 * 这里不创建 WebSocket，也不依赖 Electron 窗口或 IPC。
 */

import { AgentOperationsRepository } from '../repositories/agent-operations-repository'
import { MessagesRepository } from '../repositories/messages-repository'
import { ProjectsRepository } from '../repositories/projects-repository'
import { SessionsRepository } from '../repositories/sessions-repository'
import { SettingsRepository } from '../repositories/settings-repository'
import { ThreadsRepository } from '../repositories/threads-repository'
import { ToolInvocationsRepository } from '../repositories/tool-invocations-repository'
import { TopicsRepository } from '../repositories/topics-repository'
import { ChatService } from '../services/chat-service'
import { bootstrapDatabase } from '../db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from '../db/connection'

export type CreateMoonServerRuntimeOptions = {
  attachmentsDirectory: string
  dataDir: string
  migrationsFolder?: string
}

export type MoonServerRuntime = {
  agentOperationsRepository: AgentOperationsRepository
  chatService: ChatService
  close: () => Promise<void>
  databaseConnection: AppDatabaseConnection
  messagesRepository: MessagesRepository
  projectsRepository: ProjectsRepository
  sessionsRepository: SessionsRepository
  settingsRepository: SettingsRepository
  threadsRepository: ThreadsRepository
  toolInvocationsRepository: ToolInvocationsRepository
  topicsRepository: TopicsRepository
}

/**
 * 创建本地 Moon server runtime，并完成 PGlite migration 与会话仓储装配。
 */
export async function createMoonServerRuntime({
  attachmentsDirectory,
  dataDir,
  migrationsFolder
}: CreateMoonServerRuntimeOptions): Promise<MoonServerRuntime> {
  const databaseConnection = await createDatabaseConnection(dataDir)

  await bootstrapDatabase(databaseConnection, migrationsFolder)

  const settingsRepository = new SettingsRepository(databaseConnection)
  const projectsRepository = new ProjectsRepository(databaseConnection)
  const sessionsRepository = new SessionsRepository(databaseConnection)
  const topicsRepository = new TopicsRepository(databaseConnection)
  const threadsRepository = new ThreadsRepository(databaseConnection)
  const agentOperationsRepository = new AgentOperationsRepository(databaseConnection)
  const messagesRepository = new MessagesRepository(databaseConnection)
  const toolInvocationsRepository = new ToolInvocationsRepository(databaseConnection)
  const chatService = new ChatService({
    agentOperationsRepository,
    attachmentsDirectory,
    messagesRepository,
    projectsRepository,
    sessionsRepository,
    settingsRepository,
    threadsRepository,
    toolInvocationsRepository,
    topicsRepository
  })

  let closed = false

  return {
    agentOperationsRepository,
    chatService,
    close: async () => {
      if (closed) {
        return
      }

      closed = true
      await databaseConnection.close()
    },
    databaseConnection,
    messagesRepository,
    projectsRepository,
    sessionsRepository,
    settingsRepository,
    threadsRepository,
    toolInvocationsRepository,
    topicsRepository
  }
}
