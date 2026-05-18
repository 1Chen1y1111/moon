import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ChatPage } from '@renderer/pages/chat'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import { createDefaultAppSettings, type AppSettings } from '@moon/shared/domain/settings'

const session = {
  id: 'session-1',
  projectId: null,
  provider: 'openai',
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

function createModelSwitchSettings(): AppSettings {
  const settings = createDefaultAppSettings()

  settings.providers.openai = {
    ...settings.providers.openai,
    enabled: true,
    hasApiKey: true,
    apiKey: 'openai-key',
    model: 'gpt-5.4',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', enabled: true, isManual: false },
      { id: 'gpt-5.2', name: 'GPT-5.2', enabled: true, isManual: false }
    ],
    availableModels: [
      { id: 'gpt-5.4', name: 'GPT-5.4', enabled: true, isManual: false },
      { id: 'gpt-5.2', name: 'GPT-5.2', enabled: true, isManual: false }
    ]
  }
  settings.providers.deepseek = {
    ...settings.providers.deepseek,
    enabled: true,
    hasApiKey: true,
    apiKey: 'deepseek-key',
    model: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true, isManual: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', enabled: true, isManual: false }
    ],
    availableModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true, isManual: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', enabled: true, isManual: false }
    ]
  }

  return settings
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

    expect(screen.getByText('准备开始聊天')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '记忆' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('button', { name: '技能' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')

    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
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
    api.chat.getMessages.mockResolvedValue([userMessage, assistantMessage])
    const { user } = renderWithProviders(<ChatPage />)

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '你好')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(api.chat.sendMessage).toHaveBeenCalledWith({ content: '你好' }))
    expect(await screen.findByText('你好，我在。')).toBeInTheDocument()
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

    await waitFor(() => expect(api.chat.importAttachment).toHaveBeenCalled())
    expect(await screen.findByText('note.txt')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() =>
      expect(api.chat.sendMessage).toHaveBeenCalledWith({
        content: '',
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
      expect(api.chat.importAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'docs/note.md'
        })
      )
    )
    expect(await screen.findByText('docs/note.md')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() =>
      expect(api.chat.sendMessage).toHaveBeenCalledWith({
        content: '',
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
        deepseek: {
          ...appSettings.providers.deepseek,
          model: 'deepseek-reasoner'
        }
      }
    }
    api = installMockWindowApi({
      appSettings,
      savedSettings,
      sentChatMessage: {
        session: {
          ...session,
          provider: 'deepseek'
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
    await user.click(await screen.findByRole('button', { name: '选择模型 DeepSeek Reasoner' }))

    await waitFor(() =>
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'deepseek',
          model: 'deepseek-reasoner'
        })
      )
    )

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.chat.sendMessage).toHaveBeenCalledWith({
        provider: 'deepseek',
        content: 'hello'
      })
    )
  })

  it('switches the active session provider model from the action bar', async () => {
    const appSettings = createModelSwitchSettings()
    const savedSettings = {
      ...appSettings,
      providers: {
        ...appSettings.providers,
        deepseek: {
          ...appSettings.providers.deepseek,
          model: 'deepseek-reasoner'
        }
      }
    }
    api = installMockWindowApi({
      appSettings,
      savedSettings,
      chatMessages: [userMessage],
      chatSessions: [session],
      sentChatMessage: {
        session: {
          ...session,
          provider: 'deepseek'
        },
        messages: [userMessage, assistantMessage]
      }
    })
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedChat: {
        sessions: [session],
        messages: [userMessage],
        sessionsStatus: 'succeeded'
      },
      preloadedSettings: {
        appSettings,
        loadStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    await user.click(screen.getByRole('button', { name: /切换模型/ }))
    await user.click(await screen.findByRole('button', { name: '选择模型 DeepSeek Reasoner' }))

    await waitFor(() =>
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'deepseek',
          model: 'deepseek-reasoner'
        })
      )
    )

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.chat.sendMessage).toHaveBeenCalledWith({
        sessionId: 'session-1',
        threadId: 'thread-1',
        provider: 'deepseek',
        content: 'hello'
      })
    )
  })

  it('renders the submitted message and streamed assistant text before send completes', async () => {
    let resolveSend: (result: Awaited<ReturnType<typeof api.chat.sendMessage>>) => void
    const completedMessages = [
      { ...userMessage, content: '流式测试' },
      { ...assistantMessage, id: 'message-streaming', content: '正在回复完成' }
    ]

    api.chat.getMessages.mockResolvedValue(completedMessages)
    api.chat.sendMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve
      })
    )
    const { user } = renderWithProviders(<ChatPage />)

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '流式测试')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(screen.getByText('流式测试')).toBeInTheDocument()

    const streamListener = api.chat.onSendMessageEvent.mock.calls[0][0]
    act(() => {
      streamListener({
        type: 'message-created',
        operationId: 'operation-1',
        session,
        topic,
        thread,
        message: {
          ...assistantMessage,
          id: 'message-streaming',
          content: '',
          status: 'streaming'
        }
      })
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
      resolveSend!({
        session,
        topic,
        thread,
        operation,
        messages: completedMessages
      })
    })

    expect(await screen.findByText('正在回复完成')).toBeInTheDocument()
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
      expect(api.chat.getMessages).toHaveBeenCalledWith({
        sessionId: 'session-1',
        threadId: 'thread-1'
      })
    )
    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '继续')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.chat.sendMessage).toHaveBeenCalledWith({
        content: '继续',
        sessionId: 'session-1',
        threadId: 'thread-1'
      })
    )
    expect(await screen.findByText('你好，我在。')).toBeInTheDocument()
  })

  it('shows send failures without clearing the draft', async () => {
    api.chat.sendMessage.mockRejectedValueOnce(new Error('model down'))
    const { user } = renderWithProviders(<ChatPage />, {
      preloadedChat: {
        sessions: [session],
        sessionsStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '失败测试')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('model down')
    expect(screen.getByRole('textbox', { name: '消息内容' })).toHaveValue('失败测试')
  })
})
