import { render, screen, within } from '@testing-library/react'
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
    renderInShell()
    const section = screen.getByRole('region', { name: 'Home empty state' })
    const scoped = within(section)

    expect(scoped.getByText('Alma')).toBeInTheDocument()
    expect(scoped.getByText('优雅的 AI 提供商编排桌面应用')).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: '新建聊天' })).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: '配置提供商' })).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: '设置' })).toBeInTheDocument()
    expect(scoped.getByText('请至少配置一个 AI 提供商以开始聊天')).toBeInTheDocument()
  })

  it('keeps the landing content inside shell main without a textbox composer', () => {
    renderInShell()

    const section = screen.getByRole('region', { name: 'Home empty state' })
    const shellMain = screen.getByRole('main')
    const rails = screen.getAllByRole('complementary')

    expect(shellMain).toContainElement(section)
    expect(rails).toHaveLength(1)
    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
