import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceSidebar } from '@renderer/layouts/workspace-shell/WorkspaceSidebar'
import { WorkspaceShell } from '@renderer/layouts/workspace-shell'
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

const newChatSession = {
  ...session,
  id: 'session-new',
  title: '新聊天'
} as const

function renderRail(): void {
  renderWithProviders(<WorkspaceSidebar />)
}

function renderInShell(options: Parameters<typeof renderWithProviders>[1] = {}): void {
  renderWithProviders(
    <WorkspaceShell>
      <section aria-label="Test route stage">route content</section>
    </WorkspaceShell>,
    options
  )
}

function renderChatInShell(options: Parameters<typeof renderWithProviders>[1] = {}): void {
  renderWithProviders(
    <WorkspaceShell>
      <ChatPage />
    </WorkspaceShell>,
    options
  )
}

describe('WorkspaceSidebar', () => {
  let api: MockMoonApi

  beforeEach(() => {
    window.location.hash = '#/'
    api = installMockWindowApi({ chatSessions: [session] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the Moon floating rail assets and recent sessions', async () => {
    const user = userEvent.setup()

    renderRail()

    const sidebarShell = screen.getByRole('complementary', { name: 'Workspace navigation' })

    expect(sidebarShell).toBeInTheDocument()
    expect(sidebarShell.firstElementChild).toHaveClass('border-border', 'bg-card', 'rounded-xl')
    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建聊天' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '清除历史' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '计划讨论' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument()

    await user.hover(screen.getByRole('button', { name: '更多操作' }))

    expect(await screen.findByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  it('opens a blank chat entry without creating a session', async () => {
    const user = userEvent.setup()
    api = installMockWindowApi({ chatSessions: [session] })

    renderInShell({ routeState: { activeChatId: 'session-1' } })

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    const shellMain = screen.getByRole('main')
    const sessionButton = await within(rail).findByRole('button', { name: '计划讨论' })

    expect(shellMain).toHaveClass('flex', 'min-h-screen', 'min-w-0', 'flex-1')
    expect(within(shellMain).getByRole('region', { name: 'Test route stage' })).toBeInTheDocument()
    expect(sessionButton).toHaveAttribute('aria-current', 'page')

    await user.click(within(rail).getByRole('button', { name: '新建聊天' }))
    expect(api.chat.createSession).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/')
    expect(sessionButton).not.toHaveAttribute('aria-current')
  })

  it('does not reuse an existing new chat session from the shell rail', async () => {
    const user = userEvent.setup()
    api = installMockWindowApi({ chatSessions: [session, newChatSession] })

    renderInShell({ routeState: { activeChatId: 'session-1' } })

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    const sessionButton = await within(rail).findByRole('button', { name: '计划讨论' })
    const newChatButton = await within(rail).findByRole('button', { name: '新聊天' })

    expect(sessionButton).toHaveAttribute('aria-current', 'page')

    await user.click(within(rail).getByRole('button', { name: '新建聊天' }))
    expect(window.location.hash).toBe('#/')
    expect(api.chat.createSession).not.toHaveBeenCalled()
    expect(sessionButton).not.toHaveAttribute('aria-current')
    expect(newChatButton).not.toHaveAttribute('aria-current')
  })

  it('clears the active draft when opening the blank chat entry', async () => {
    const user = userEvent.setup()
    api = installMockWindowApi({ chatSessions: [session] })

    renderChatInShell({
      preloadedChat: {
        sessions: [session],
        sessionsStatus: 'succeeded'
      },
      routeState: { activeChatId: 'session-1' }
    })

    const textbox = screen.getByRole('textbox', { name: '消息内容' })
    await user.type(textbox, '旧会话草稿')

    await user.click(screen.getByRole('button', { name: '新建聊天' }))

    expect(api.chat.createSession).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/')
    expect(screen.getByText('我们该做什么？')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '消息内容' })).toHaveValue('')
  })

  it('deletes a session from the hover action', async () => {
    const user = userEvent.setup()

    renderInShell({ routeState: { activeChatId: 'session-1' } })

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    const sessionButton = await within(rail).findByRole('button', { name: '计划讨论' })

    await user.hover(sessionButton)
    await user.click(within(rail).getByRole('button', { name: '删除会话 计划讨论' }))

    await waitFor(() =>
      expect(api.chat.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
    )
    expect(within(rail).queryByRole('button', { name: '计划讨论' })).not.toBeInTheDocument()
  })

  it('opens settings from the shell rail', async () => {
    const user = userEvent.setup()

    renderInShell()

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    await user.hover(within(rail).getByRole('button', { name: '更多操作' }))
    await user.click(await within(rail).findByRole('button', { name: '设置' }))

    expect(api.windowControls.openSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Configure Provider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
  })

  it('keeps the more actions menu open long enough to move into it', () => {
    vi.useFakeTimers()

    renderRail()

    const trigger = screen.getByRole('button', { name: '更多操作' })

    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('button', { name: '管理提示词应用' })).toBeInTheDocument()

    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('button', { name: '管理提示词应用' })).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByRole('button', { name: '管理提示词应用' }))
    vi.advanceTimersByTime(200)

    expect(screen.getByRole('button', { name: '管理提示词应用' })).toBeInTheDocument()
  })
})
