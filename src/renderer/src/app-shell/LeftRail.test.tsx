import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppShell } from './AppShell'
import { LeftRail } from './LeftRail'
import { useSettingsStore } from '@renderer/lib/stores/settings-store'
import { useUiStore } from '@renderer/lib/stores/ui-store'

describe('LeftRail', () => {
  beforeEach(() => {
    useUiStore.setState({
      isProviderSetupDialogOpen: false,
      isSettingsDialogOpen: false
    })
    useSettingsStore.setState({
      providerDrafts: {
        claude: {
          apiKey: '',
          model: ''
        }
      },
      activeSettingsSection: 'general'
    })
  })

  it('renders labelled controls for New Chat and Settings', () => {
    render(<LeftRail />)

    expect(screen.getByRole('button', { name: 'New Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('anchors Settings in a bottom rail group', () => {
    render(<LeftRail />)

    const rail = screen.getByRole('complementary', { name: 'Workspace navigation' })
    const bottomGroup = screen.getByRole('group', { name: 'Secondary actions' })
    const settingsButton = screen.getByRole('button', { name: 'Settings' })

    expect(rail).toHaveClass('h-full')
    expect(bottomGroup).toHaveClass('mt-auto')
    expect(bottomGroup).toContainElement(settingsButton)
  })

  it('opens the mounted settings dialog from the rail trigger', async () => {
    const user = userEvent.setup()

    render(
      <AppShell>
        <section>Shell content</section>
      </AppShell>
    )

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })
})
