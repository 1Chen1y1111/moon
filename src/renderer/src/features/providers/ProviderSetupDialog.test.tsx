import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore, type EnhancedStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import { settingsReducer } from '@renderer/features/settings'

import { ProviderSetupDialog } from './ProviderSetupDialog'
import type { ProviderDraftState } from './model/providers.types'
import {
  openProviderSetupDialog,
  providersReducer
} from './model/slices'

type ProviderDialogTestStore = EnhancedStore<{
  providers: ProviderDraftState
  settings: ReturnType<typeof settingsReducer>
}>

function createTestStore(
  preloadedProviders?: Partial<ProviderDraftState>
): ProviderDialogTestStore {
  return configureStore({
    reducer: {
      providers: providersReducer,
      settings: settingsReducer
    },
    preloadedState: {
      providers: {
        claudeDraft: {
          apiKey: '',
          model: ''
        },
        isDialogOpen: false,
        ...preloadedProviders
      }
    }
  })
}

function renderDialog(
  preloadedProviders?: Partial<ProviderDraftState>
): ProviderDialogTestStore {
  const store = createTestStore(preloadedProviders)

  render(
    <Provider store={store}>
      <ProviderSetupDialog />
    </Provider>
  )

  return store
}

describe('ProviderSetupDialog', () => {
  it('renders a provider-ready Claude modal with API key and model fields when opened', () => {
    const store = renderDialog()

    act(() => {
      store.dispatch(openProviderSetupDialog())
    })

    const dialog = screen.getByRole('dialog', { name: 'Configure Provider' })
    const scoped = within(dialog)

    expect(scoped.getByText('Claude')).toBeInTheDocument()
    expect(scoped.getByLabelText('Provider')).toHaveDisplayValue('Claude')
    expect(scoped.getByLabelText('API Key')).toHaveAttribute('type', 'password')
    expect(scoped.getByLabelText('Model')).toHaveValue('')
    expect(scoped.getByRole('button', { name: 'Save Provider' })).toBeInTheDocument()
  })

  it('submits the Claude provider draft and closes the modal', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const store = createTestStore()

    render(
      <Provider store={store}>
        <ProviderSetupDialog onSubmit={onSubmit} />
      </Provider>
    )

    act(() => {
      store.dispatch(openProviderSetupDialog())
    })

    await user.type(screen.getByLabelText('API Key'), 'sk-ant-demo')
    await user.type(screen.getByLabelText('Model'), 'claude-3-7-sonnet-latest')
    await user.click(screen.getByRole('button', { name: 'Save Provider' }))

    expect(onSubmit).toHaveBeenCalledWith({
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest'
    })
    expect(store.getState().providers.claudeDraft).toEqual({
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest'
    })
    expect(store.getState().providers.isDialogOpen).toBe(false)
  })

  it('validates required provider fields before submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const store = createTestStore()

    render(
      <Provider store={store}>
        <ProviderSetupDialog onSubmit={onSubmit} />
      </Provider>
    )

    act(() => {
      store.dispatch(openProviderSetupDialog())
    })

    await user.click(screen.getByRole('button', { name: 'Save Provider' }))

    expect(screen.getByText('API key is required.')).toBeInTheDocument()
    expect(screen.getByText('Model is required.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(store.getState().providers.isDialogOpen).toBe(true)
  })

  it('discards unsaved values and stale validation errors after cancel and reopen', async () => {
    const user = userEvent.setup()
    const store = createTestStore({
      claudeDraft: {
        apiKey: 'persisted-key',
        model: 'claude-3-7-sonnet-latest'
      }
    })

    render(
      <Provider store={store}>
        <ProviderSetupDialog />
      </Provider>
    )

    act(() => {
      store.dispatch(openProviderSetupDialog())
    })

    await user.clear(screen.getByLabelText('API Key'))
    await user.type(screen.getByLabelText('API Key'), 'temporary-key')
    await user.clear(screen.getByLabelText('Model'))
    await user.click(screen.getByRole('button', { name: 'Save Provider' }))

    expect(screen.getByText('Model is required.')).toBeInTheDocument()
    expect(store.getState().providers.claudeDraft).toEqual({
      apiKey: 'persisted-key',
      model: 'claude-3-7-sonnet-latest'
    })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(store.getState().providers.isDialogOpen).toBe(false)

    act(() => {
      store.dispatch(openProviderSetupDialog())
    })

    expect(screen.getByLabelText('API Key')).toHaveValue('persisted-key')
    expect(screen.getByLabelText('Model')).toHaveValue('claude-3-7-sonnet-latest')
    expect(screen.queryByText('Model is required.')).not.toBeInTheDocument()
  })

  it('keeps the cancel action as a non-submit button', () => {
    const store = renderDialog()

    act(() => {
      store.dispatch(openProviderSetupDialog())
    })

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
  })
})
