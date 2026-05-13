import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ChatPage } from '@renderer/pages/chat'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import { createDefaultAppSettings, type AppSettings } from '@shared/domain/settings'

const session = {
  id: 'session-1',
  projectId: null,
  provider: 'openai',
  title: '计划讨论',
  status: 'active',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} as const

const userMessage = {
  id: 'message-1',
  sessionId: 'session-1',
  role: 'user',
  content: '你好',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} as const

const assistantMessage = {
  id: 'message-2',
  sessionId: 'session-1',
  role: 'assistant',
  content: '你好，我在。',
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
    expect(screen.getByRole('button', { name: '记忆' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '技能' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')

    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
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
        type: 'assistant-start',
        message: {
          ...assistantMessage,
          id: 'message-streaming',
          content: ''
        }
      })
      streamListener({
        type: 'assistant-delta',
        messageId: 'message-streaming',
        delta: '正在回复'
      })
    })

    expect(await screen.findByText('正在回复')).toBeInTheDocument()

    await act(async () => {
      resolveSend!({
        session,
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
      expect(api.chat.getMessages).toHaveBeenCalledWith({ sessionId: 'session-1' })
    )
    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '继续')
    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() =>
      expect(api.chat.sendMessage).toHaveBeenCalledWith({
        content: '继续',
        sessionId: 'session-1'
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
