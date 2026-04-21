import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { HomePage } from '@renderer/pages/home/HomePage'
import { WorkspaceShell } from '@renderer/widgets/workspace-shell'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'

function renderInShell(): void {
  render(
    <WorkspaceShell>
      <HomePage />
    </WorkspaceShell>
  )
}

describe('HomePage', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi()
  })

  it('renders the Moon landing hero content', () => {
    render(<HomePage />)
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

    expect(shellMain).toContainElement(section)
    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(within(shellMain).queryByRole('textbox')).not.toBeInTheDocument()
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
