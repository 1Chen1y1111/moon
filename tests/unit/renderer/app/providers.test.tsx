import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppSettings } from '@ipc/contracts'
import { AppProviders } from '@renderer/app/providers'
import { useAppSelector } from '@renderer/app/store/hooks'
import { installMockWindowApi } from '@tests/helpers/renderer/mock-window-api'

function SettingsProbe(): React.JSX.Element {
  const activeSection = useAppSelector((state) => state.settings.activeSection)
  return <span>{activeSection}</span>
}

describe('AppProviders', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
    installMockWindowApi()
  })

  it('provides the Redux store to renderer children', () => {
    render(
      <AppProviders>
        <SettingsProbe />
      </AppProviders>
    )

    expect(screen.getByText('general')).toBeInTheDocument()
  })

  it('applies theme changes received from another renderer window', async () => {
    const api = installMockWindowApi()

    render(
      <AppProviders>
        <SettingsProbe />
      </AppProviders>
    )

    await waitFor(() => {
      expect(api.settings.onChange).toHaveBeenCalled()
    })

    const listener = api.settings.onChange.mock.calls[0][0]
    const settings = {
      ...createDefaultAppSettings(),
      appearance: {
        theme: 'dark'
      }
    }

    act(() => {
      listener(settings)
    })

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
    })
  })
})
