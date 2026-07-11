/**
 * 负责验证聊天首页的主要交互和输入区行为。
 * 测试通过 mock window.api 覆盖渲染端到主进程的边界。
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ChatPage } from '@renderer/pages/chat'
import { useChatStore, type ChatState } from '@renderer/store/chat'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import type {
  AgentOperationRecord,
  ChatOperationEvent,
  MessageRecord,
  ThreadRecord,
  ToolInvocationRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import { createDefaultAppSettings, type AppSettings } from '@moon/shared/domain/settings'

const session = {
  id: 'session-1',
  projectId: null,
  provider: 'claude',
  title: '计划讨论',
  status: 'active',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} as const

const topic = {
  id: 'topic-1',
  sessionId: 'session-1',
  title: '默认话题',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} as const

const thread = {
  id: 'thread-1',
  topicId: 'topic-1',
  title: '主线',
  type: 'standalone',
  status: 'active',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} as const

const operation = {
  id: 'operation-1',
  appContext: { sessionId: 'session-1' },
  topicId: 'topic-1',
  threadId: 'thread-1',
  status: 'done',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:01.000Z',
  completedAt: '2026-05-09T00:00:01.000Z'
} as const

const userMessage = {
  id: 'message-1',
  sessionId: 'session-1',
  topicId: 'topic-1',
  threadId: 'thread-1',
  role: 'user',
  content: '你好',
  status: 'complete',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} as const

const assistantMessage = {
  id: 'message-2',
  sessionId: 'session-1',
  topicId: 'topic-1',
  threadId: 'thread-1',
  role: 'assistant',
  content: '你好，我在。',
  status: 'complete',
  createdAt: '2026-05-09T00:00:01.000Z',
  updatedAt: '2026-05-09T00:00:01.000Z'
} as const

const project = {
  id: 'project-1',
  name: 'moon',
  path: '/workspace/moon',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} satisfies ProjectRecord

function createModelSwitchSettings(): AppSettings {
  const settings = createDefaultAppSettings()

  settings.providers.claude = {
    ...settings.providers.claude,
    enabled: true,
    hasApiKey: true,
    apiKey: 'claude-key',
    model: 'claude-sonnet-4-5',
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', enabled: true, isManual: false },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', enabled: true, isManual: false }
    ],
    availableModels: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', enabled: true, isManual: false },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', enabled: true, isManual: false }
    ]
  }

  return settings
}

function createOperationRecord(input: Partial<AgentOperationRecord> = {}): AgentOperationRecord {
  return {
    id: 'operation-1',
    appContext: { sessionId: 'session-1' },
    topicId: 'topic-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:01.000Z',
    ...input
  }
}

function createToolInvocation(input: Partial<ToolInvocationRecord> = {}): ToolInvocationRecord {
  return {
    id: 'tool-1',
    operationId: 'operation-1',
    messageId: 'message-2',
    name: 'Bash',
    arguments: {
      description: '需要执行测试命令',
      command: 'pnpm test'
    },
    intervention: {
      type: 'permission_request',
      description: '需要执行测试命令',
      command: 'pnpm test'
    },
    status: 'waiting_for_human',
    createdAt: '2026-05-09T00:00:02.000Z',
    updatedAt: '2026-05-09T00:00:02.000Z',
    ...input
  }
}

function toMessageState(
  messages: MessageRecord[]
): Pick<ChatState, 'messageIds' | 'messages' | 'messagesMap'> {
  return {
    messages,
    messageIds: messages.map((message) => message.id),
    messagesMap: Object.fromEntries(messages.map((message) => [message.id, message]))
  }
}

function createStreamingAssistantMessage(input: Partial<MessageRecord> = {}): MessageRecord {
  return {
    ...assistantMessage,
    operationId: 'operation-1',
    content: '部分回复',
    status: 'streaming',
    ...input
  }
}

function createRunningOperationState(): ChatState['operationsById'] {
  return {
    'operation-1': {
      id: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      assistantMessageId: 'message-2',
      userMessageId: 'message-1',
      status: 'running',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:01.000Z'
    }
  }
}

function renderActiveChat(preloadedChat: Partial<ChatState> = {}) {
  return renderWithProviders(<ChatPage />, {
    preloadedChat: {
      activeSessionId: 'session-1',
      activeTopicId: 'topic-1',
      activeThreadId: 'thread-1',
      sessions: [session],
      sessionsStatus: 'succeeded',
      topics: [topic],
      topicsStatus: 'succeeded',
      threads: [thread],
      threadsStatus: 'succeeded',
      messagesStatus: 'succeeded',
      ...preloadedChat
    },
    routeState: { activeChatId: 'session-1' }
  })
}

async function getSessionEventListener(
  api: MockMoonApi
): Promise<(event: ChatOperationEvent) => void> {
  await waitFor(() => expect(api.sessions.onSessionEvent).toHaveBeenCalled())
  await act(async () => undefined)

  return api.sessions.onSessionEvent.mock.calls[0][0]
}

function emitSessionEvent(
  listener: (event: ChatOperationEvent) => void,
  event: ChatOperationEvent
) {
  act(() => {
    listener(event)
  })
}

describe('ChatPage', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi({
      chatMessages: [],
      chatSessions: [session],
      sentChatMessage: {
        session,
        messages: [userMessage, assistantMessage]
      }
    })
  })

  it('renders the empty state and disables empty sends', async () => {
    const { user } = renderWithProviders(<ChatPage />)

    expect(screen.getByText('我们该做什么？')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '记忆' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('button', { name: '技能' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(screen.getByText(/未绑定项目/)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')

    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
    expect(api.sessions.getMessages).not.toHaveBeenCalled()
  })

  it('shows a skeleton while historical messages load', async () => {
    let resolveMessages!: (messages: MessageRecord[]) => void
    api.sessions.getMessages.mockReturnValue(
      new Promise((resolve) => {
        resolveMessages = resolve
      })
    )

    renderWithProviders(<ChatPage />, {
      preloadedChat: {
        activeSessionId: 'session-1',
        activeThreadId: 'thread-1',
        activeTopicId: 'topic-1',
        sessions: [session],
        sessionsStatus: 'succeeded',
        threads: [thread],
        threadsStatus: 'succeeded',
        topics: [topic],
        topicsStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    expect(screen.getByRole('status', { name: '加载聊天消息' })).toBeInTheDocument()
    expect(screen.queryByText('正在加载消息...')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(api.sessions.getMessages).toHaveBeenCalledWith({
        sessionId: 'session-1',
        threadId: 'thread-1'
      })
    )

    resolveMessages([userMessage, assistantMessage])

    expect(await screen.findByText('你好，我在。')).toBeInTheDocument()
  })

  it('opens the web search action panel and toggles the search mode', async () => {
    const { user } = renderWithProviders(<ChatPage />)

    const searchButton = screen.getByRole('button', { name: '联网搜索' })

    await user.click(searchButton)

    expect(await screen.findByText('关闭搜索')).toBeInTheDocument()
    expect(screen.getByText('智能联网')).toBeInTheDocument()
    expect(screen.queryByText('使用模型内置的网络搜索。')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /智能联网/ }))

    expect(screen.getByText('使用模型内置的网络搜索。')).toBeInTheDocument()
    expect(searchButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the memory action panel and toggles memory effort', async () => {
    const { user } = renderWithProviders(<ChatPage />)

    const memoryButton = screen.getByRole('button', { name: '记忆' })

    await user.click(memoryButton)

    expect(await screen.findByText('关闭记忆')).toBeInTheDocument()
    expect(screen.getByText('开启记忆')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '记忆强度' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /开启记忆/ }))

    expect(screen.getByRole('group', { name: '记忆强度' })).toBeInTheDocument()
    expect(memoryButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '高' }))

    expect(screen.getByRole('button', { name: '高' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the skills action panel and toggles a skill', async () => {
    const { user } = renderWithProviders(<ChatPage />)

    const skillsButton = screen.getByRole('button', { name: '技能' })

    await user.click(skillsButton)

    expect(await screen.findByRole('textbox', { name: '搜索技能' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '技能启用模式' })).toBeInTheDocument()
    expect(screen.getByText('上下文整理')).toBeInTheDocument()
    expect(screen.getByText('代码助手')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '启用技能 代码助手' }))

    expect(screen.getByRole('button', { name: '停用技能 代码助手' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(skillsButton).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByRole('textbox', { name: '搜索技能' }), '文档')

    expect(screen.getByText('文档阅读')).toBeInTheDocument()
    expect(screen.queryByText('代码助手')).not.toBeInTheDocument()
  })

  it('sends a new chat message and renders the returned messages', async () => {
    api.sessions.getMessages.mockResolvedValue([userMessage, assistantMessage])
    const { user } = renderWithProviders(<ChatPage />)

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '你好')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        content: '你好',
        projectId: null
      })
    )
    expect(await screen.findByText('你好，我在。')).toBeInTheDocument()
  })

  it('sends a new chat message with the active project id', async () => {
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedProjects: {
        activeProject: project,
        loadStatus: 'succeeded',
        projects: [project]
      }
    })

    expect(screen.getByText(/moon/)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '项目任务')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        content: '项目任务',
        projectId: 'project-1'
      })
    )
  })

  it('renders assistant markdown and reasoning content', () => {
    renderWithProviders(<ChatPage />, {
      preloadedChat: {
        sessions: [session],
        messages: [
          {
            ...assistantMessage,
            content: '# Markdown Title',
            reasoning: 'checked context'
          }
        ],
        sessionsStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    expect(screen.getByText('Markdown Title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /推理/ })).toBeInTheDocument()
    expect(screen.getByText('checked context')).toBeInTheDocument()
  })

  it('creates a branch from an assistant reply and switches between thread projections', async () => {
    const sourceMessage: MessageRecord = {
      ...assistantMessage,
      metadata: {
        providerMessageId: 'provider-message-source',
        providerSessionId: 'provider-session-parent'
      }
    }
    const laterParentUser: MessageRecord = {
      ...userMessage,
      id: 'message-parent-later-user',
      parentId: sourceMessage.id,
      content: '父线后续问题',
      createdAt: '2026-05-09T00:00:02.000Z',
      updatedAt: '2026-05-09T00:00:02.000Z'
    }
    const laterParentAssistant: MessageRecord = {
      ...assistantMessage,
      id: 'message-parent-later-assistant',
      parentId: laterParentUser.id,
      content: '父线后续回答',
      createdAt: '2026-05-09T00:00:03.000Z',
      updatedAt: '2026-05-09T00:00:03.000Z'
    }
    const parentMessages = [userMessage, sourceMessage, laterParentUser, laterParentAssistant]
    const childThread: ThreadRecord = {
      ...thread,
      id: 'thread-branch',
      title: '分支问题',
      type: 'continuation',
      parentThreadId: thread.id,
      sourceMessageId: sourceMessage.id
    }
    const childOperation: AgentOperationRecord = {
      ...operation,
      id: 'operation-branch',
      appContext: { sessionId: session.id, sourceMessageId: sourceMessage.id },
      threadId: childThread.id,
      status: 'idle',
      completedAt: null
    }
    const childUserMessage: MessageRecord = {
      ...userMessage,
      id: 'message-branch-user',
      threadId: childThread.id,
      parentId: sourceMessage.id,
      operationId: childOperation.id,
      content: '换个方向解释'
    }
    const childAssistantMessage: MessageRecord = {
      ...assistantMessage,
      id: 'message-branch-assistant',
      threadId: childThread.id,
      parentId: childUserMessage.id,
      operationId: childOperation.id,
      content: '',
      status: 'pending'
    }
    const completedChildAssistant: MessageRecord = {
      ...childAssistantMessage,
      content: '这是分支回答',
      status: 'complete'
    }
    const completedChildOperation: AgentOperationRecord = {
      ...childOperation,
      status: 'done',
      completionReason: 'done',
      completedAt: '2026-05-09T00:00:04.000Z'
    }
    const childLineage = [userMessage, sourceMessage, childUserMessage, completedChildAssistant]

    api.sessions.createMessageTurn.mockResolvedValueOnce({
      session,
      topic,
      thread: childThread,
      operation: childOperation,
      userMessage: childUserMessage,
      assistantMessage: childAssistantMessage
    })
    api.sessions.runOperation.mockResolvedValueOnce({
      operation: completedChildOperation,
      messages: childLineage
    })
    api.sessions.getMessages.mockImplementation(async ({ threadId }) =>
      threadId === childThread.id ? childLineage : parentMessages
    )

    const { user } = renderActiveChat({
      ...toMessageState(parentMessages),
      messagesStatus: 'succeeded'
    })

    await user.click(screen.getByRole('button', { name: '从这里创建分支' }))

    expect(screen.getByLabelText('分支输入模式')).toHaveTextContent('你好，我在。')

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '换个方向解释')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        sessionId: session.id,
        parentThreadId: thread.id,
        sourceMessageId: sourceMessage.id,
        content: '换个方向解释'
      })
    )
    await waitFor(() => expect(useChatStore.getState().activeThreadId).toBe(childThread.id))
    expect(await screen.findByText('这是分支回答')).toBeInTheDocument()
    expect(screen.queryByText('父线后续问题')).not.toBeInTheDocument()

    const threadSelector = screen.getByRole('combobox', { name: '切换分支' })

    expect(threadSelector).toHaveTextContent('分支问题')

    act(() => useChatStore.getState().switchChatThread(thread.id))

    await waitFor(() => expect(useChatStore.getState().activeThreadId).toBe(thread.id))
    await waitFor(() =>
      expect(api.sessions.getMessages).toHaveBeenCalledWith({
        sessionId: session.id,
        threadId: thread.id
      })
    )
    expect(await screen.findByText('父线后续问题')).toBeInTheDocument()
  })

  it('uploads a text attachment and sends it without message text', async () => {
    const { container, user } = renderWithProviders(<ChatPage />)
    const fileInput = container.querySelector('input[accept*=".txt"]') as HTMLInputElement | null

    expect(fileInput).not.toBeNull()

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(['hello'], 'note.txt', { type: 'text/plain' })]
      }
    })

    await waitFor(() => expect(api.sessions.importAttachment).toHaveBeenCalled())
    expect(await screen.findByText('note.txt')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        content: '',
        projectId: null,
        attachments: [
          expect.objectContaining({
            id: 'attachment-1',
            name: 'note.txt',
            mimeType: 'text/plain',
            kind: 'file'
          })
        ]
      })
    )
  })

  it('uploads folder files with their relative paths', async () => {
    const { container, user } = renderWithProviders(<ChatPage />)
    const folderInput = container.querySelector(
      'input[data-upload-kind="folder"]'
    ) as HTMLInputElement | null
    const file = new File(['hello'], 'note.md', { type: 'text/markdown' })

    Object.defineProperty(file, 'webkitRelativePath', { value: 'docs/note.md' })

    expect(folderInput).not.toBeNull()

    fireEvent.change(folderInput!, {
      target: {
        files: [file]
      }
    })

    await waitFor(() =>
      expect(api.sessions.importAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'docs/note.md'
        })
      )
    )
    expect(await screen.findByText('docs/note.md')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        content: '',
        projectId: null,
        attachments: [
          expect.objectContaining({
            name: 'docs/note.md',
            mimeType: 'text/markdown',
            kind: 'file'
          })
        ]
      })
    )
  })

  it('switches the draft provider model from the action bar', async () => {
    const appSettings = createModelSwitchSettings()
    const savedSettings = {
      ...appSettings,
      providers: {
        ...appSettings.providers,
        claude: {
          ...appSettings.providers.claude,
          model: 'claude-opus-4-5'
        }
      }
    }
    api = installMockWindowApi({
      appSettings,
      savedSettings,
      sentChatMessage: {
        session: {
          ...session,
          provider: 'claude'
        },
        messages: [userMessage, assistantMessage]
      }
    })
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedSettings: {
        appSettings,
        loadStatus: 'succeeded'
      }
    })

    await user.click(screen.getByRole('button', { name: /切换模型/ }))
    await user.click(await screen.findByRole('button', { name: '选择模型 Claude Opus 4.5' }))

    await waitFor(() =>
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'claude',
          model: 'claude-opus-4-5'
        })
      )
    )

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        provider: 'claude',
        projectId: null,
        content: 'hello'
      })
    )
  })

  it('offers DeepSeek models from enabled selectable providers', async () => {
    const appSettings = createDefaultAppSettings()
    const deepseekModel = {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      enabled: false,
      isManual: false,
      providerApi: 'openai-completions',
      providerBaseUrl: 'https://api.deepseek.com'
    }

    appSettings.providers.deepseek = {
      ...appSettings.providers.deepseek,
      enabled: true,
      hasApiKey: true,
      apiKey: 'sk-deepseek-demo',
      model: '',
      models: [],
      availableModels: [deepseekModel]
    }

    const { user } = renderWithProviders(<ChatPage />, {
      preloadedSettings: {
        appSettings,
        loadStatus: 'succeeded'
      }
    })

    await screen.findByText('我们该做什么？')

    await user.click(screen.getByRole('button', { name: /切换模型/ }))
    await user.click(await screen.findByRole('button', { name: '选择模型 DeepSeek V4 Flash' }))

    await waitFor(() =>
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'deepseek',
          apiKey: '',
          model: 'deepseek-v4-flash',
          models: [
            expect.objectContaining({
              id: 'deepseek-v4-flash',
              enabled: true
            })
          ],
          availableModels: [
            expect.objectContaining({
              id: 'deepseek-v4-flash',
              enabled: true
            })
          ]
        })
      )
    )
  })

  it('prefers synchronized LLM connection models in the action bar', async () => {
    const appSettings = createModelSwitchSettings()
    const deepseekModel = {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      enabled: true,
      isManual: false,
      providerApi: 'openai-completions',
      providerBaseUrl: 'https://api.deepseek.com'
    }

    appSettings.providers.deepseek = {
      ...appSettings.providers.deepseek,
      enabled: true,
      hasApiKey: true,
      apiKey: 'sk-deepseek-demo',
      model: deepseekModel.id,
      models: [deepseekModel],
      availableModels: [deepseekModel]
    }
    appSettings.llmConnections = [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        providerId: 'deepseek',
        backend: 'pi_compat',
        model: 'deepseek-v4-flash',
        apiKey: 'sk-deepseek-demo',
        baseUrl: 'https://api.deepseek.com',
        customEndpoint: { api: 'openai-completions' },
        enabled: true,
        isDefault: true,
        thinkingLevel: 'medium'
      }
    ]

    const { user } = renderWithProviders(<ChatPage />, {
      preloadedSettings: {
        appSettings,
        loadStatus: 'succeeded'
      }
    })

    await screen.findByText('我们该做什么？')

    await user.click(screen.getByRole('button', { name: /切换模型/ }))

    const deepseekOption = await screen.findByRole('button', {
      name: '选择模型 DeepSeek V4 Flash'
    })

    expect(deepseekOption).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '选择模型 Claude Sonnet 4.5' })
    ).not.toBeInTheDocument()

    await user.click(deepseekOption)

    expect(api.settings.saveProvider).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        llmConnectionId: 'deepseek',
        projectId: null,
        content: 'hello'
      })
    )
  })

  it('switches the active session provider model from the action bar', async () => {
    const claudeSession = {
      ...session,
      provider: 'claude'
    } as const
    const appSettings = createModelSwitchSettings()
    const savedSettings = {
      ...appSettings,
      providers: {
        ...appSettings.providers,
        claude: {
          ...appSettings.providers.claude,
          model: 'claude-opus-4-5'
        }
      }
    }
    api = installMockWindowApi({
      appSettings,
      savedSettings,
      chatMessages: [userMessage],
      chatSessions: [claudeSession],
      sentChatMessage: {
        session: claudeSession,
        messages: [userMessage, assistantMessage]
      }
    })
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedChat: {
        activeSessionId: 'session-1',
        activeThreadId: 'thread-1',
        activeTopicId: 'topic-1',
        messages: [userMessage],
        sessions: [claudeSession],
        sessionsStatus: 'succeeded',
        threads: [thread],
        threadsStatus: 'succeeded',
        topics: [topic],
        topicsStatus: 'succeeded'
      },
      preloadedSettings: {
        appSettings,
        loadStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    await user.click(screen.getByRole('button', { name: /切换模型/ }))
    await user.click(await screen.findByRole('button', { name: '选择模型 Claude Opus 4.5' }))

    await waitFor(() =>
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'claude',
          model: 'claude-opus-4-5'
        })
      )
    )

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        sessionId: 'session-1',
        threadId: 'thread-1',
        provider: 'claude',
        projectId: null,
        content: 'hello'
      })
    )
  })

  it('renders the submitted message and streamed assistant text before send completes', async () => {
    let resolveRun: (result: Awaited<ReturnType<typeof api.sessions.runOperation>>) => void
    const completedMessages = [
      { ...userMessage, content: '流式测试' },
      { ...assistantMessage, id: 'message-streaming', content: '正在回复完成' }
    ]

    api = installMockWindowApi({
      chatMessages: [],
      chatSessions: [session],
      sentChatMessage: {
        session,
        topic,
        thread,
        operation,
        messages: completedMessages
      }
    })
    api.sessions.getMessages.mockResolvedValue([])
    api.sessions.runOperation.mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve
      })
    )
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedChat: {
        activeSessionId: 'session-1',
        activeTopicId: 'topic-1',
        activeThreadId: 'thread-1',
        sessions: [session],
        topics: [topic],
        threads: [thread],
        sessionsStatus: 'succeeded',
        topicsStatus: 'succeeded',
        threadsStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    await waitFor(() => expect(api.sessions.getMessages).toHaveBeenCalled())

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '流式测试')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(screen.getByText('流式测试')).toBeInTheDocument()

    const streamListener = api.sessions.onSessionEvent.mock.calls[0][0]
    act(() => {
      streamListener({
        type: 'message-delta',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'message-streaming',
        delta: '正在回复'
      })
    })

    expect(await screen.findByText('正在回复')).toBeInTheDocument()

    await act(async () => {
      resolveRun!({
        operation,
        messages: completedMessages
      })
    })

    expect(await screen.findByText('正在回复完成')).toBeInTheDocument()
  })

  it('replays session events into visible completion state', async () => {
    const { user } = renderActiveChat()
    const listener = await getSessionEventListener(api)
    const streamingAssistantMessage = createStreamingAssistantMessage({
      content: '',
      reasoning: ''
    })
    const waitingToolInvocation = createToolInvocation()
    const finishedToolInvocation = createToolInvocation({
      result: {
        title: '命令输出',
        output: 'tests passed'
      },
      status: 'done',
      updatedAt: '2026-05-09T00:00:03.000Z'
    })

    emitSessionEvent(listener, {
      type: 'message-created',
      operationId: 'operation-1',
      session,
      topic,
      thread,
      message: userMessage
    })
    emitSessionEvent(listener, {
      type: 'message-created',
      operationId: 'operation-1',
      session,
      topic,
      thread,
      message: streamingAssistantMessage
    })
    emitSessionEvent(listener, {
      type: 'operation-started',
      operationId: 'operation-1',
      operation: createOperationRecord()
    })
    emitSessionEvent(listener, {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      delta: '正在处理'
    })
    emitSessionEvent(listener, {
      type: 'reasoning-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      delta: '检查上下文'
    })
    emitSessionEvent(listener, {
      type: 'tool-waiting-approval',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      toolInvocation: waitingToolInvocation
    })

    expect(await screen.findByText('正在处理')).toBeInTheDocument()
    expect(screen.getByText('检查上下文')).toBeInTheDocument()
    expect(screen.getByText('等待确认')).toBeInTheDocument()
    expect(screen.getByText('pnpm test')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '允许' }))

    await waitFor(() =>
      expect(api.sessions.approveToolCall).toHaveBeenCalledWith({
        toolInvocationId: 'tool-1'
      })
    )
    expect(await screen.findByText('已允许')).toBeInTheDocument()

    emitSessionEvent(listener, {
      type: 'tool-finish',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      toolInvocation: finishedToolInvocation
    })

    expect(await screen.findByText('命令输出')).toBeInTheDocument()
    expect(screen.getByText('tests passed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '允许' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument()

    emitSessionEvent(listener, {
      type: 'operation-done',
      operationId: 'operation-1',
      session,
      topic,
      thread,
      operation: createOperationRecord({
        status: 'done',
        completedAt: '2026-05-09T00:00:04.000Z',
        updatedAt: '2026-05-09T00:00:04.000Z'
      }),
      messages: [
        userMessage,
        {
          ...assistantMessage,
          content: '处理完成',
          reasoning: '检查上下文',
          toolInvocations: [finishedToolInvocation]
        }
      ]
    })

    expect(await screen.findByText('处理完成')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
  })

  it('renders ordinary operation errors as visible failed state', async () => {
    const streamingAssistantMessage = createStreamingAssistantMessage()

    renderActiveChat({
      ...toMessageState([userMessage, streamingAssistantMessage]),
      activeOperationId: 'operation-1',
      operationsById: createRunningOperationState(),
      sendStatus: 'sending',
      streamingAssistantMessageId: 'message-2'
    })
    const listener = await getSessionEventListener(api)

    emitSessionEvent(listener, {
      type: 'operation-error',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      error: 'backend failed',
      operation: createOperationRecord({
        status: 'error',
        error: { message: 'backend failed' },
        updatedAt: '2026-05-09T00:00:02.000Z'
      })
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('backend failed')
    expect(screen.getAllByText('backend failed').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
  })

  it('renders interrupted operation errors as cancellation', async () => {
    const streamingAssistantMessage = createStreamingAssistantMessage()

    renderActiveChat({
      ...toMessageState([userMessage, streamingAssistantMessage]),
      activeOperationId: 'operation-1',
      operationsById: createRunningOperationState(),
      sendStatus: 'sending',
      streamingAssistantMessageId: 'message-2'
    })
    const listener = await getSessionEventListener(api)

    emitSessionEvent(listener, {
      type: 'operation-error',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      error: 'Cancelled by user.',
      operation: createOperationRecord({
        status: 'interrupted',
        interruption: {
          canResume: false,
          interruptedAt: '2026-05-09T00:00:02.000Z',
          reason: 'Cancelled by user.'
        },
        updatedAt: '2026-05-09T00:00:02.000Z'
      })
    })

    expect(await screen.findByText('Cancelled by user.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
  })

  it('keeps visible cancellation stable when a late operation error arrives', async () => {
    const streamingAssistantMessage = createStreamingAssistantMessage()

    api.sessions.cancelOperation.mockResolvedValueOnce(
      createOperationRecord({
        status: 'interrupted',
        interruption: {
          canResume: false,
          interruptedAt: '2026-05-09T00:00:02.000Z',
          reason: 'Cancelled by user.'
        },
        updatedAt: '2026-05-09T00:00:02.000Z'
      })
    )
    const { user } = renderActiveChat({
      ...toMessageState([userMessage, streamingAssistantMessage]),
      activeOperationId: 'operation-1',
      operationsById: createRunningOperationState(),
      sendStatus: 'sending',
      streamingAssistantMessageId: 'message-2'
    })
    const listener = await getSessionEventListener(api)

    await user.click(await screen.findByRole('button', { name: '停止生成' }))

    await waitFor(() =>
      expect(api.sessions.cancelOperation).toHaveBeenCalledWith({ operationId: 'operation-1' })
    )
    expect(await screen.findByText('Cancelled by user.')).toBeInTheDocument()

    emitSessionEvent(listener, {
      type: 'operation-error',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      error: 'late backend failure',
      operation: createOperationRecord({
        status: 'error',
        error: { message: 'late backend failure' },
        updatedAt: '2026-05-09T00:00:03.000Z'
      })
    })

    expect(screen.getByText('Cancelled by user.')).toBeInTheDocument()
    expect(screen.queryByText('late backend failure')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps rejected permission cards visible after rejecting from ChatPage', async () => {
    const { user } = renderActiveChat({
      ...toMessageState([userMessage, createStreamingAssistantMessage({ content: '' })]),
      activeOperationId: 'operation-1',
      operationsById: createRunningOperationState(),
      sendStatus: 'sending',
      streamingAssistantMessageId: 'message-2'
    })
    const listener = await getSessionEventListener(api)

    emitSessionEvent(listener, {
      type: 'tool-waiting-approval',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-2',
      toolInvocation: createToolInvocation()
    })

    expect(await screen.findByText('等待确认')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '拒绝' }))

    await waitFor(() =>
      expect(api.sessions.rejectToolCall).toHaveBeenCalledWith({
        toolInvocationId: 'tool-1'
      })
    )
    expect(await screen.findByText('已拒绝')).toBeInTheDocument()
    expect(screen.getByText('Rejected by user.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '允许' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument()
  })

  it('loads the active session messages and sends with its session id', async () => {
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedChat: {
        sessions: [session],
        messages: [userMessage],
        sessionsStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    await waitFor(() =>
      expect(api.sessions.getMessages).toHaveBeenCalledWith({
        sessionId: 'session-1',
        threadId: 'thread-1'
      })
    )
    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '继续')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.sessions.createMessageTurn).toHaveBeenCalledWith({
        content: '继续',
        projectId: null,
        sessionId: 'session-1',
        threadId: 'thread-1'
      })
    )
    expect(await screen.findByText('你好，我在。')).toBeInTheDocument()
  })

  it('shows send failures without clearing the draft', async () => {
    api.sessions.createMessageTurn.mockRejectedValueOnce(new Error('model down'))
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedChat: {
        activeSessionId: 'session-1',
        activeThreadId: 'thread-1',
        activeTopicId: 'topic-1',
        sessions: [session],
        sessionsStatus: 'succeeded',
        threads: [thread],
        threadsStatus: 'succeeded',
        topics: [topic],
        topicsStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '失败测试')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('model down')
    expect(screen.getByRole('textbox', { name: '消息内容' })).toHaveValue('失败测试')
  })
})
