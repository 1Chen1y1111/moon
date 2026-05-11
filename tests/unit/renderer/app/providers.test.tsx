import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@renderer/app/providers'
import { resetChatStore } from '@renderer/store/chat'
import { selectActiveSettingsSection } from '@renderer/store/settings/selectors'
import { resetSettingsStore, useSettingsStore } from '@renderer/store/settings'
import { createDefaultAppSettings } from '@shared/domain/settings'
import { installMockWindowApi } from '@tests/helpers/renderer/mock-window-api'

function SettingsProbe(): React.JSX.Element {
  const activeSection = useSettingsStore(selectActiveSettingsSection)
  return <span>{activeSection}</span>
}

describe('AppProviders', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
    resetChatStore()
    resetSettingsStore()
    installMockWindowApi()
  })

  it('provides the settings store and loads settings from the app provider boundary', async () => {
    const api = installMockWindowApi()

    render(
      <AppProviders>
        <SettingsProbe />
      </AppProviders>
    )

    expect(screen.getByText('general')).toBeInTheDocument()
    await waitFor(() => {
      expect(api.settings.get).toHaveBeenCalledTimes(1)
    })
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
