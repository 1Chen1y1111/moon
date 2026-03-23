import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@renderer/shell/AppShell'
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
    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()

    const newChatButtons = screen.getAllByRole('button', { name: '鏂板缓鑱婂ぉ' })

    expect(newChatButtons).toHaveLength(1)
    expect(newChatButtons.find((button) => !(button as HTMLButtonElement).disabled)).toBeEnabled()
    expect(screen.getByRole('button', { name: '娓呴櫎鍘嗗彶' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '璁剧疆' })).not.toBeInTheDocument()

    await user.hover(screen.getByRole('button', { name: '鏇村鎿嶄綔' }))

    expect(await screen.findByRole('button', { name: '璁剧疆' })).toBeInTheDocument()
  })

  it('renders shell main content beside the rail', async () => {
    const user = userEvent.setup()

    renderInShell()

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    const shellMain = screen.getByRole('main')
    const railNewChatButton = within(rail)
      .getAllByRole('button', { name: '鏂板缓鑱婂ぉ' })
      .find((button) => !(button as HTMLButtonElement).disabled)

    expect(shellMain).toHaveClass('flex', 'min-h-screen', 'min-w-0', 'flex-1')
    expect(within(shellMain).getByRole('region', { name: 'Test route stage' })).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: '娓呴櫎鍘嗗彶' }))
    fireEvent.click(railNewChatButton as HTMLButtonElement)
    await user.hover(within(rail).getByRole('button', { name: '鏇村鎿嶄綔' }))
    fireEvent.click(within(rail).getByRole('button', { name: '璁剧疆' }))

    expect(screen.queryByRole('dialog', { name: 'Configure Provider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    expect(useUiStore.getState().isProviderSetupDialogOpen).toBe(false)
    expect(useUiStore.getState().isSettingsDialogOpen).toBe(false)
  })

  it('keeps the more actions menu open long enough to move into it', () => {
    vi.useFakeTimers()

    render(<LeftRail />)

    const trigger = screen.getByRole('button', { name: '鏇村鎿嶄綔' })

    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('button', { name: '绠＄悊鎻愮ず璇嶅簲鐢?' })).toBeInTheDocument()

    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('button', { name: '绠＄悊鎻愮ず璇嶅簲鐢?' })).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByRole('button', { name: '绠＄悊鎻愮ず璇嶅簲鐢?' }))
    vi.advanceTimersByTime(200)

    expect(screen.getByRole('button', { name: '绠＄悊鎻愮ず璇嶅簲鐢?' })).toBeInTheDocument()
  })
})
