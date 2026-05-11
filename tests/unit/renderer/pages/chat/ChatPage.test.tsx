import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ChatPage } from '@renderer/pages/chat'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'

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
