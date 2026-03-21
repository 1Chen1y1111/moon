import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppShell } from '@renderer/app-shell/AppShell'
import { useUiStore } from '@renderer/lib/stores/ui-store'
import { HomeEmptyState } from './HomeEmptyState'

function renderInShell(): void {
  render(
    <AppShell>
      <HomeEmptyState />
    </AppShell>
  )
}

describe('HomeEmptyState', () => {
  beforeEach(() => {
    useUiStore.setState({
      isProviderSetupDialogOpen: false,
      isSettingsDialogOpen: false
    })
  })

  it('renders the alma landing hero content', () => {
    render(<HomeEmptyState />)
    const section = screen.getByRole('region', { name: 'Alma landing view' })
    const scoped = within(section)
    const primaryCta = scoped.getByRole('button', { name: '新建聊天' })
    const providerCta = scoped.getByRole('button', { name: '配置提供商' })
    const settingsCta = scoped.getByRole('button', { name: '设置' })

    expect(scoped.getByText('Alma')).toBeInTheDocument()
    expect(scoped.getByText('优雅的 AI 提供商编排桌面应用')).toBeInTheDocument()
    expect(primaryCta).toHaveAttribute('type', 'button')
    expect(providerCta).toHaveAttribute('type', 'button')
    expect(settingsCta).toHaveAttribute('type', 'button')
    expect(scoped.getByText('请至少配置一个 AI 提供商以开始聊天')).toBeInTheDocument()
  })

  it('keeps the landing content inside shell main without a textbox composer', () => {
    renderInShell()

    const section = screen.getByRole('region', { name: 'Alma landing view' })
    const shellMain = screen.getByRole('main')

    expect(shellMain).toContainElement(section)
    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(within(shellMain).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps provider and settings ctas inert', () => {
    renderInShell()

    fireEvent.click(screen.getByRole('button', { name: '配置提供商' }))
    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.queryByRole('dialog', { name: 'Configure Provider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    expect(useUiStore.getState().isProviderSetupDialogOpen).toBe(false)
    expect(useUiStore.getState().isSettingsDialogOpen).toBe(false)
  })
})
