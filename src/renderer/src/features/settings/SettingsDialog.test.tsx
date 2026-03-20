import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SettingsDialog } from './SettingsDialog'
import { useSettingsStore } from '@renderer/lib/stores/settings-store'
import { useUiStore } from '@renderer/lib/stores/ui-store'

function renderDialog(): void {
  render(<SettingsDialog />)
}

describe('SettingsDialog', () => {
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

  it('renders settings as a modal with the expected sections when opened', () => {
    useUiStore.getState().openSettingsDialog()

    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const scoped = within(dialog)

    expect(scoped.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    expect(scoped.getByRole('tab', { name: 'Providers' })).toBeInTheDocument()
    expect(scoped.getByRole('tab', { name: 'Appearance' })).toBeInTheDocument()
    expect(scoped.getByRole('tab', { name: 'Projects' })).toBeInTheDocument()
    expect(scoped.getByText('Tune how Moon behaves before wiring persistence.')).toBeInTheDocument()
  })

  it('switches sections and shows provider summary content', async () => {
    const user = userEvent.setup()

    useSettingsStore.setState({
      providerDrafts: {
        claude: {
          apiKey: 'sk-ant-demo',
          model: 'claude-3-7-sonnet-latest'
        }
      },
      activeSettingsSection: 'general'
    })

    useUiStore.getState().openSettingsDialog()
    renderDialog()

    await user.click(screen.getByRole('tab', { name: 'Providers' }))

    expect(useSettingsStore.getState().activeSettingsSection).toBe('providers')
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('claude-3-7-sonnet-latest')).toBeInTheDocument()
    expect(screen.getByText('API key saved for this session only.')).toBeInTheDocument()
  })

  it('closes the modal from the dismiss action', async () => {
    const user = userEvent.setup()

    useUiStore.getState().openSettingsDialog()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Close Settings' }))

    expect(useUiStore.getState().isSettingsDialogOpen).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
  })
})
