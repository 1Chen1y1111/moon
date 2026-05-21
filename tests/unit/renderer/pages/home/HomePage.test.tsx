import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { HomePage } from '@renderer/pages/home/HomePage'
import { WorkspaceShell } from '@renderer/layouts/workspace-shell'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'

const newChatSession = {
  id: 'session-new',
  projectId: null,
  provider: 'openai',
  title: '新聊天',
  status: 'active',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
} as const

const createdSession = {
  ...newChatSession,
  id: 'session-created'
} as const

function renderInShell(options: Parameters<typeof renderWithProviders>[1] = {}): void {
  renderWithProviders(
    <WorkspaceShell>
      <HomePage />
    </WorkspaceShell>,
    options
  )
}

describe('HomePage', () => {
  let api: MockMoonApi

  beforeEach(() => {
    window.location.hash = '#/'
    api = installMockWindowApi()
  })

  it('renders the Moon landing hero content', () => {
    renderWithProviders(<HomePage />)
    const section = screen.getByRole('region', { name: 'Moon landing view' })
    const scoped = within(section)
    const primaryCta = scoped.getByRole('button', { name: '新建聊天' })
    const providerCta = scoped.getByRole('button', { name: '配置提供商' })
    const settingsCta = scoped.getByRole('button', { name: '设置' })

    expect(scoped.getByText('Moon')).toBeInTheDocument()
    expect(scoped.getByText('优雅的 AI 提供商编排桌面应用')).toBeInTheDocument()
    expect(primaryCta).toHaveAttribute('type', 'button')
    expect(providerCta).toHaveAttribute('type', 'button')
    expect(settingsCta).toHaveAttribute('type', 'button')
    expect(scoped.getByText('请至少配置一个 AI 提供商以开始聊天')).toBeInTheDocument()
  })

  it('keeps the landing content inside shell main without a textbox composer', () => {
    renderInShell()

    const section = screen.getByRole('region', { name: 'Moon landing view' })
    const shellMain = screen.getByRole('main')
    const workspaceChrome = within(screen.getByTestId('workspace-content-drag-region'))

    expect(shellMain).toContainElement(section)
    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(workspaceChrome.getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(workspaceChrome.getByRole('button', { name: '放大窗口' })).toBeInTheDocument()
    expect(workspaceChrome.getByRole('button', { name: '关闭窗口' })).toBeInTheDocument()
    expect(within(shellMain).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('creates a new chat from the primary CTA when no reusable chat exists', async () => {
    api = installMockWindowApi({ createdChatSession: createdSession })
    renderInShell()

    const section = screen.getByRole('region', { name: 'Moon landing view' })

    fireEvent.click(within(section).getByRole('button', { name: '新建聊天' }))

    await waitFor(() => expect(api.chat.createSession).toHaveBeenCalledTimes(1))
    expect(window.location.hash).toBe('#/chat')
    expect(await screen.findByRole('button', { name: '新聊天' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('reuses an existing new chat from the primary CTA', () => {
    renderInShell({
      preloadedChat: {
        sessions: [newChatSession],
        sessionsStatus: 'succeeded'
      }
    })

    const section = screen.getByRole('region', { name: 'Moon landing view' })

    fireEvent.click(within(section).getByRole('button', { name: '新建聊天' }))

    expect(window.location.hash).toBe('#/chat')
    expect(api.chat.createSession).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '新聊天' })).toHaveAttribute('aria-current', 'page')
  })

  it('runs window controls from the workspace top chrome on the landing page', () => {
    renderInShell()

    const workspaceChrome = within(screen.getByTestId('workspace-content-drag-region'))

    fireEvent.click(workspaceChrome.getByRole('button', { name: '最小化窗口' }))
    fireEvent.click(workspaceChrome.getByRole('button', { name: '放大窗口' }))
    fireEvent.click(workspaceChrome.getByRole('button', { name: '关闭窗口' }))

    expect(api.windowControls.minimize).toHaveBeenCalledTimes(1)
    expect(api.windowControls.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(api.windowControls.close).toHaveBeenCalledTimes(1)
  })

  it('opens the dedicated settings window from provider and settings CTAs', () => {
    renderInShell()

    const section = screen.getByRole('region', { name: 'Moon landing view' })
    const scoped = within(section)

    fireEvent.click(scoped.getByRole('button', { name: '配置提供商' }))
    fireEvent.click(scoped.getByRole('button', { name: '设置' }))

    expect(api.windowControls.openSettings).toHaveBeenCalledWith({ section: 'providers' })
    expect(api.windowControls.openSettings).toHaveBeenCalledWith()
  })
})
