import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderSetupDialog } from './ProviderSetupDialog'
import { useSettingsStore } from '@renderer/lib/stores/settings-store'
import { useUiStore } from '@renderer/lib/stores/ui-store'

function renderDialog(): void {
  render(<ProviderSetupDialog />)
}

describe('ProviderSetupDialog', () => {
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

  it('renders a provider-ready claude modal with api key and model fields when opened', () => {
    useUiStore.getState().openProviderSetupDialog()

    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Configure Provider' })
    const scoped = within(dialog)

    expect(scoped.getByText('Claude')).toBeInTheDocument()
    expect(scoped.getByLabelText('Provider')).toHaveDisplayValue('Claude')
    expect(scoped.getByLabelText('API Key')).toHaveAttribute('type', 'password')
    expect(scoped.getByLabelText('Model')).toHaveValue('')
    expect(scoped.getByRole('button', { name: 'Save Provider' })).toBeInTheDocument()
  })

  it('submits the claude provider draft and closes the modal', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    useUiStore.getState().openProviderSetupDialog()
    render(<ProviderSetupDialog onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('API Key'), 'sk-ant-demo')
    await user.type(screen.getByLabelText('Model'), 'claude-3-7-sonnet-latest')
    await user.click(screen.getByRole('button', { name: 'Save Provider' }))

    expect(onSubmit).toHaveBeenCalledWith({
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest'
    })
    expect(useSettingsStore.getState().providerDrafts.claude).toEqual({
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest'
    })
    expect(useUiStore.getState().isProviderSetupDialogOpen).toBe(false)
  })

  it('validates required provider fields before submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    useUiStore.getState().openProviderSetupDialog()
    render(<ProviderSetupDialog onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Save Provider' }))

    expect(screen.getByText('API key is required.')).toBeInTheDocument()
    expect(screen.getByText('Model is required.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(useUiStore.getState().isProviderSetupDialogOpen).toBe(true)
  })

  it('discards unsaved values and stale validation errors after cancel and reopen', async () => {
    const user = userEvent.setup()

    useSettingsStore.setState({
      providerDrafts: {
        claude: {
          apiKey: 'persisted-key',
          model: 'claude-3-7-sonnet-latest'
        }
      },
      activeSettingsSection: 'general'
    })

    useUiStore.getState().openProviderSetupDialog()
    renderDialog()

    await user.clear(screen.getByLabelText('API Key'))
    await user.type(screen.getByLabelText('API Key'), 'temporary-key')
    await user.clear(screen.getByLabelText('Model'))
    await user.click(screen.getByRole('button', { name: 'Save Provider' }))

    expect(screen.getByText('Model is required.')).toBeInTheDocument()
    expect(useSettingsStore.getState().providerDrafts.claude).toEqual({
      apiKey: 'persisted-key',
      model: 'claude-3-7-sonnet-latest'
    })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(useUiStore.getState().isProviderSetupDialogOpen).toBe(false)

    act(() => {
      useUiStore.getState().openProviderSetupDialog()
    })

    expect(screen.getByLabelText('API Key')).toHaveValue('persisted-key')
    expect(screen.getByLabelText('Model')).toHaveValue('claude-3-7-sonnet-latest')
    expect(screen.queryByText('Model is required.')).not.toBeInTheDocument()
  })

  it('keeps the cancel action as a non-submit button', () => {
    useUiStore.getState().openProviderSetupDialog()

    renderDialog()

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
  })
})
