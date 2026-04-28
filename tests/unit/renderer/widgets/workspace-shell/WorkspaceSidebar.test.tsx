import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceSidebar } from '@renderer/widgets/workspace-shell/WorkspaceSidebar'
import { WorkspaceShell } from '@renderer/widgets/workspace-shell'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'

function renderRail(): void {
  render(<WorkspaceSidebar />)
}

function renderInShell(): void {
  render(
    <WorkspaceShell>
      <section aria-label="Test route stage">route content</section>
    </WorkspaceShell>
  )
}

describe('WorkspaceSidebar', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the Moon floating rail assets', async () => {
    const user = userEvent.setup()

    renderRail()

    const sidebarShell = screen.getByRole('complementary', { name: 'Workspace navigation' })

    expect(sidebarShell).toBeInTheDocument()
    expect(sidebarShell.firstElementChild).toHaveClass('border-border', 'bg-card', 'rounded-xl')
    expect(sidebarShell.firstElementChild).not.toHaveClass('shadow-moon-ring')
    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新' })).not.toHaveClass('shadow-moon-ring')

    const newChatButtons = screen.getAllByRole('button', { name: '新建聊天' })

    expect(newChatButtons).toHaveLength(1)
    expect(newChatButtons.find((button) => !(button as HTMLButtonElement).disabled)).toBeEnabled()
    expect(screen.getByRole('button', { name: '清除历史' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument()

    await user.hover(screen.getByRole('button', { name: '更多操作' }))

    expect(await screen.findByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  it('opens the dedicated settings window from the shell rail', async () => {
    const user = userEvent.setup()

    renderInShell()

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    const shellMain = screen.getByRole('main')
    const railNewChatButton = within(rail)
      .getAllByRole('button', { name: '新建聊天' })
      .find((button) => !(button as HTMLButtonElement).disabled)

    expect(shellMain).toHaveClass('flex', 'min-h-screen', 'min-w-0', 'flex-1')
    expect(within(shellMain).getByRole('region', { name: 'Test route stage' })).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: '清除历史' }))
    fireEvent.click(railNewChatButton as HTMLButtonElement)
    await user.hover(within(rail).getByRole('button', { name: '更多操作' }))
    fireEvent.click(within(rail).getByRole('button', { name: '设置' }))

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
