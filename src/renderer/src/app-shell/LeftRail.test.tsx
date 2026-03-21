import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@renderer/app-shell/AppShell'
import { useUiStore } from '@renderer/lib/stores/ui-store'
import { LeftRail } from './LeftRail'

function renderInShell(): void {
  render(
    <AppShell>
      <section aria-label="Test route stage">route content</section>
    </AppShell>
  )
}

describe('LeftRail', () => {
  beforeEach(() => {
    useUiStore.setState({
      isProviderSetupDialogOpen: false,
      isSettingsDialogOpen: false
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the Moon floating rail assets', async () => {
    const user = userEvent.setup()

    render(<LeftRail />)

    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '折叠侧边栏' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument()
    expect(screen.queryByText('折叠侧边栏')).not.toBeInTheDocument()
    expect(screen.queryByText('搜索')).not.toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()
    const newChatButtons = screen.getAllByRole('button', { name: '新建聊天' })

    expect(newChatButtons).toHaveLength(1)
    expect(newChatButtons.find((button) => !(button as HTMLButtonElement).disabled)).toBeEnabled()
    expect(screen.getByRole('button', { name: '清除历史' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '管理提示词应用' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '图库' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '现场编程' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show External Chats' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作' })).toHaveClass('bg-transparent')
    expect(screen.getByRole('button', { name: '更新' })).toHaveClass(
      'bg-[#31475f]',
      'border-[#3f6687]'
    )

    await user.hover(screen.getByRole('button', { name: '更多操作' }))

    expect(await screen.findByRole('button', { name: '管理提示词应用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '图库' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '现场编程' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show External Chats' })).toBeInTheDocument()
  })

  it('keeps rail actions inert inside the shell stage', async () => {
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
    fireEvent.click(within(rail).getByRole('button', { name: '管理提示词应用' }))
    fireEvent.click(within(rail).getByRole('button', { name: '图库' }))
    fireEvent.click(within(rail).getByRole('button', { name: '现场编程' }))
    fireEvent.click(within(rail).getByRole('button', { name: '设置' }))
    fireEvent.click(within(rail).getByRole('button', { name: 'Show External Chats' }))
    fireEvent.click(within(rail).getByRole('button', { name: '更多操作' }))
    fireEvent.click(within(rail).getByRole('button', { name: '更新' }))

    expect(screen.queryByRole('dialog', { name: 'Configure Provider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    expect(useUiStore.getState().isProviderSetupDialogOpen).toBe(false)
    expect(useUiStore.getState().isSettingsDialogOpen).toBe(false)
  })

  it('keeps the more actions menu open long enough to move into it', async () => {
    vi.useFakeTimers()

    render(<LeftRail />)

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
