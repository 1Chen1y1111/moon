// @vitest-environment node

/**
 * 负责验证 SessionMessageTurnRuntime 的消息 turn 持久化骨架创建。
 * 测试只覆盖 server-core 内部 turn 创建，不启动 backend 或消费 AgentEvent。
 */

import { describe, expect, it } from 'vitest'

import { llmConnectionSchema, type NormalizedLlmConnection } from '@moon/shared/config'
import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
  MessageRecord,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import {
  SessionMessageTurnRuntime,
  type SessionMessageTurnRuntimeInput
} from '@moon/server-core/sessions/session-message-turn-runtime'
import type { SessionAgentTargetResult } from '@moon/server-core/sessions/session-agent-target-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'

/**
 * 创建测试用 Anthropic connection。
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
 * 创建 target runtime 已解析好的 agent target。
 */
function createTarget(
  input: Partial<SessionAgentTargetResult> = {}
): SessionAgentTargetResult {
  return {
    connection: createConnection(),
    persistedLlmConnectionId: 'connection-1',
    providerId: 'claude',
    session: null,
    ...input
  }
}

/**
 * 创建项目记录。
 */
function createProject(input: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    name: 'moon',
    path: '/workspace/moon',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input
  }
}

/**
 * 创建会话记录。
 */
function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    llmConnectionId: 'connection-1',
    projectId: null,
    provider: 'claude',
    title: 'Existing session',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建话题记录。
 */
function createTopic(overrides: Partial<TopicRecord> = {}): TopicRecord {
  return {
    id: 'topic-1',
    sessionId: 'session-1',
    title: '默认话题',
    userId: 'default-user',
    trigger: 'chat',
    mode: 'default',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建线程记录。
 */
function createThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: 'thread-1',
    topicId: 'topic-1',
    title: '主线',
    type: 'standalone',
    status: 'active',
    userId: 'default-user',
    lastActiveAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建消息记录。
 */
function createMessage(
  role: MessageRecord['role'],
  overrides: Partial<MessageRecord> = {}
): MessageRecord {
  return {
    id: `${role}-message-1`,
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    operationId: 'operation-existing',
    role,
    content: role === 'assistant' ? 'assistant answer' : 'hello',
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

/**
 * 创建附件记录。
 */
function createAttachment(input: Partial<ChatAttachmentRecord> = {}): ChatAttachmentRecord {
  return {
    id: 'attachment-1',
    name: '设计说明.md',
    mimeType: 'text/markdown',
    size: 12,
    kind: 'file',
    createdAt: timestamp,
    ...input
  }
}

/**
 * 创建 message turn runtime 聚焦测试使用的内存仓储。
 */
function createRuntimeFixture(
  input: {
    activeProject?: ProjectRecord | null
    messages?: MessageRecord[]
    operations?: AgentOperationRecord[]
    projects?: ProjectRecord[]
    sessions?: SessionRecord[]
    threads?: ThreadRecord[]
    topics?: TopicRecord[]
  } = {}
): {
  messages: Map<string, MessageRecord>
  operations: Map<string, AgentOperationRecord>
  projects: Map<string, ProjectRecord>
  runtime: SessionMessageTurnRuntime
  sessions: Map<string, SessionRecord>
  threads: Map<string, ThreadRecord>
  topics: Map<string, TopicRecord>
} {
  const sessions = new Map((input.sessions ?? []).map((session) => [session.id, session]))
  const topics = new Map((input.topics ?? []).map((topic) => [topic.id, topic]))
  const threads = new Map((input.threads ?? []).map((thread) => [thread.id, thread]))
  const messages = new Map((input.messages ?? []).map((message) => [message.id, message]))
  const operations = new Map(
    (input.operations ?? []).map((operation) => [operation.id, operation])
  )
  const projects = new Map((input.projects ?? []).map((project) => [project.id, project]))
  const dependencies: SessionMessageTurnRuntimeInput = {
    agentOperationsRepository: {
      findById: async (id) => operations.get(id) ?? null,
      save: async (operation) => {
        operations.set(operation.id, operation)

        return operation
      }
    },
    messagesRepository: {
      listByOperation: async (operationId) =>
        [...messages.values()].filter((message) => message.operationId === operationId),
      listByThread: async (threadId) =>
        [...messages.values()].filter((message) => message.threadId === threadId),
      save: async (message) => {
        messages.set(message.id, message)

        return message
      }
    },
    projectsRepository: {
      findById: async (id) => projects.get(id) ?? null,
      getActiveProject: async () => input.activeProject ?? null
    },
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
    threadsRepository: {
      findById: async (id) => threads.get(id) ?? null,
      listBySession: async (sessionId) => {
        const topicIds = new Set(
          [...topics.values()]
            .filter((topic) => topic.sessionId === sessionId)
            .map((topic) => topic.id)
        )

        return [...threads.values()].filter((thread) => topicIds.has(thread.topicId))
      },
      listByTopic: async (topicId) =>
        [...threads.values()].filter((thread) => thread.topicId === topicId),
      save: async (thread) => {
        threads.set(thread.id, thread)

        return thread
      }
    },
    topicsRepository: {
      findById: async (id) => topics.get(id) ?? null,
      listBySession: async (sessionId) =>
        [...topics.values()].filter((topic) => topic.sessionId === sessionId),
      save: async (topic) => {
        topics.set(topic.id, topic)

        return topic
      }
    }
  }

  return {
    messages,
    operations,
    projects,
    runtime: new SessionMessageTurnRuntime(dependencies),
    sessions,
    threads,
    topics
  }
}

describe('SessionMessageTurnRuntime', () => {
  it('creates a project-bound session, default thread, idle operation, and message pair', async () => {
    const project = createProject()
    const fixture = createRuntimeFixture({ activeProject: project, projects: [project] })

    const result = await fixture.runtime.create({
      input: { content: 'hello moon' },
      target: createTarget()
    })

    expect(result.session).toMatchObject({
      projectId: project.id,
      provider: 'claude',
      llmConnectionId: 'connection-1',
      title: 'hello moon'
    })
    expect(result.topic).toMatchObject({
      sessionId: result.session.id,
      title: 'hello moon',
      mode: 'default'
    })
    expect(result.thread).toMatchObject({
      topicId: result.topic.id,
      title: 'hello moon',
      type: 'standalone'
    })
    expect(result.operation).toMatchObject({
      status: 'idle',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      appContext: {
        sessionId: result.session.id,
        llmConnectionId: 'connection-1',
        llmConnectionBackend: 'anthropic',
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path
      }
    })
    expect(result.userMessage).toMatchObject({
      sessionId: result.session.id,
      topicId: result.topic.id,
      threadId: result.thread.id,
      operationId: result.operation.id,
      role: 'user',
      content: 'hello moon',
      status: 'complete',
      provider: 'claude',
      model: 'claude-sonnet-4-6'
    })
    expect(result.assistantMessage).toMatchObject({
      parentId: result.userMessage.id,
      operationId: result.operation.id,
      role: 'assistant',
      content: '',
      reasoning: '',
      status: 'pending'
    })
    expect(fixture.sessions).toHaveLength(1)
    expect(fixture.topics).toHaveLength(1)
    expect(fixture.threads).toHaveLength(1)
    expect(fixture.operations).toHaveLength(1)
    expect([...fixture.messages.values()].map((message) => message.role)).toEqual([
      'user',
      'assistant'
    ])
  })

  it('creates an unbound session when projectId is null', async () => {
    const activeProject = createProject()
    const fixture = createRuntimeFixture({ activeProject, projects: [activeProject] })

    const result = await fixture.runtime.create({
      input: { content: 'hello', projectId: null },
      target: createTarget()
    })

    expect(result.session.projectId).toBeNull()
    expect(result.operation.appContext).not.toHaveProperty('projectId')
  })

  it('uses the existing session project instead of input project override', async () => {
    const sessionProject = createProject({ id: 'session-project', path: '/workspace/session' })
    const inputProject = createProject({ id: 'input-project', path: '/workspace/input' })
    const session = createSession({ projectId: sessionProject.id })
    const topic = createTopic()
    const thread = createThread()
    const fixture = createRuntimeFixture({
      activeProject: inputProject,
      projects: [sessionProject, inputProject],
      sessions: [session],
      threads: [thread],
      topics: [topic]
    })

    const result = await fixture.runtime.create({
      input: { sessionId: session.id, projectId: inputProject.id, content: 'continue' },
      target: createTarget({ session })
    })

    expect(result.session.id).toBe(session.id)
    expect(result.session.projectId).toBe(sessionProject.id)
    expect(result.operation.appContext).toMatchObject({
      projectId: sessionProject.id,
      projectPath: sessionProject.path
    })
  })

  it('reuses an explicit thread and links the latest non-tool message as parent', async () => {
    const session = createSession()
    const topic = createTopic()
    const thread = createThread()
    const previousUser = createMessage('user', { id: 'previous-user' })
    const previousTool = createMessage('tool', {
      id: 'previous-tool',
      content: 'tool result',
      parentId: previousUser.id
    })
    const previousAssistant = createMessage('assistant', {
      id: 'previous-assistant',
      parentId: previousTool.id
    })
    const fixture = createRuntimeFixture({
      messages: [previousUser, previousTool, previousAssistant],
      sessions: [session],
      threads: [thread],
      topics: [topic]
    })

    const result = await fixture.runtime.create({
      input: { sessionId: session.id, threadId: thread.id, content: 'next question' },
      target: createTarget({ session })
    })

    expect(result.thread.id).toBe(thread.id)
    expect(result.topic.id).toBe(topic.id)
    expect(result.userMessage.parentId).toBe(previousAssistant.id)
  })

  it('creates a continuation thread when a topic is selected and no default thread exists', async () => {
    const session = createSession()
    const topic = createTopic({ id: 'topic-selected', title: 'Topic Selected' })
    const fixture = createRuntimeFixture({
      sessions: [session],
      topics: [topic]
    })

    const result = await fixture.runtime.create({
      input: { sessionId: session.id, topicId: topic.id, content: 'branch here' },
      target: createTarget({ session })
    })

    expect(result.topic.id).toBe(topic.id)
    expect(result.thread).toMatchObject({
      topicId: topic.id,
      type: 'continuation',
      title: 'branch here'
    })
    expect(fixture.threads).toHaveLength(1)
  })

  it('uses attachment name for title and persists user attachments', async () => {
    const attachment = createAttachment()
    const fixture = createRuntimeFixture()

    const result = await fixture.runtime.create({
      input: { content: '', attachments: [attachment] },
      target: createTarget()
    })

    expect(result.session.title).toBe(attachment.name)
    expect(result.topic.title).toBe(attachment.name)
    expect(result.thread.title).toBe(attachment.name)
    expect(result.userMessage.attachments).toEqual([attachment])
  })

  it('keeps existing error semantics for missing project and thread topic', async () => {
    const fixture = createRuntimeFixture()

    await expect(
      fixture.runtime.create({
        input: { content: 'hello', projectId: 'missing-project' },
        target: createTarget()
      })
    ).rejects.toThrow('Project not found.')

    const session = createSession()
    const orphanThread = createThread({ id: 'orphan-thread', topicId: 'missing-topic' })
    const orphanFixture = createRuntimeFixture({
      sessions: [session],
      threads: [orphanThread]
    })

    await expect(
      orphanFixture.runtime.create({
        input: { sessionId: session.id, threadId: orphanThread.id, content: 'hello' },
        target: createTarget({ session })
      })
    ).rejects.toThrow('Chat topic not found.')
  })
})
