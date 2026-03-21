import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

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

  it('renders the Alma floating rail assets', () => {
    render(<LeftRail />)

    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '筛选' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '布局' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '清除历史' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建聊天' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument()
  })

  it('keeps rail actions inert inside the shell stage', () => {
    renderInShell()

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    const shellMain = screen.getByRole('main')

    expect(shellMain).toHaveClass('flex', 'min-h-screen', 'min-w-0', 'flex-1')
    expect(within(shellMain).getByRole('region', { name: 'Test route stage' })).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: '清除历史' }))
    fireEvent.click(within(rail).getByRole('button', { name: '新建聊天' }))
    fireEvent.click(within(rail).getByRole('button', { name: '更多操作' }))
    fireEvent.click(within(rail).getByRole('button', { name: '更新' }))

    expect(screen.queryByRole('dialog', { name: 'Configure Provider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    expect(useUiStore.getState().isProviderSetupDialogOpen).toBe(false)
    expect(useUiStore.getState().isSettingsDialogOpen).toBe(false)
  })
})
