import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppShell } from '@renderer/app-shell/AppShell'
import { Button } from '@shadcn/ui/button'
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

  it('renders the alma-style empty state actions and copy', () => {
    renderInShell()
    const section = screen.getByRole('region', { name: 'Home empty state' })
    const scoped = within(section)

    expect(scoped.getByText('Moon')).toBeInTheDocument()
    expect(scoped.getByRole('heading', { name: 'How can I help you today?' })).toBeInTheDocument()
    expect(
      scoped.getByText('Start a fresh conversation, connect a provider, or adjust settings.')
    ).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: 'New Chat' })).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: 'New Chat' })).toHaveAttribute('type', 'button')
    expect(scoped.getByRole('button', { name: 'Configure Provider' })).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: 'Configure Provider' })).toHaveAttribute(
      'type',
      'button'
    )
    expect(scoped.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: 'Settings' })).toHaveAttribute('type', 'button')
  })

  it('embeds into the app shell with a decorative bottom composer and no right rail', () => {
    renderInShell()

    const section = screen.getByRole('region', { name: 'Home empty state' })
    const shellMain = screen.getByRole('main')
    const rails = screen.getAllByRole('complementary')

    expect(section).toHaveClass('min-h-full')
    expect(section).not.toHaveClass('min-h-screen')
    expect(section).not.toHaveClass('w-screen')
    expect(shellMain).toContainElement(section)
    expect(rails).toHaveLength(1)
    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Message Moon...')).toBeInTheDocument()
    expect(screen.queryByText('Enter to send')).not.toBeInTheDocument()
  })

  it('defaults Button type to button when type is not provided', () => {
    render(<Button>Quick Action</Button>)

    expect(screen.getByRole('button', { name: 'Quick Action' })).toHaveAttribute('type', 'button')
  })

  it('opens the mounted provider and settings dialogs from the home surface ctas', async () => {
    const user = userEvent.setup()

    renderInShell()
    const section = screen.getByRole('region', { name: 'Home empty state' })
    const scoped = within(section)

    await user.click(scoped.getByRole('button', { name: 'Configure Provider' }))

    expect(screen.getByRole('dialog', { name: 'Configure Provider' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(scoped.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })
})
