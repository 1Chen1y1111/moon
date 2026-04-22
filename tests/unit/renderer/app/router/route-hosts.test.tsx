import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@renderer/app/providers'
import { SettingsLayout, WorkspaceLayout } from '@renderer/app/router/route-hosts'
import { installMockWindowApi } from '@tests/helpers/renderer/mock-window-api'

describe('route layouts', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  it('renders the workspace layout with the main shell rail', () => {
    render(
      <AppProviders>
        <WorkspaceLayout>
          <section aria-label="Workspace child">workspace child</section>
        </WorkspaceLayout>
      </AppProviders>
    )

    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Workspace child' })).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-window-drag-strip')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace-content-drag-region')).toHaveClass(
      'moon-window-drag-region',
      'h-moon-chrome',
      'shrink-0'
    )
  })

  it('renders the settings layout without the workspace rail', () => {
    render(
      <AppProviders>
        <SettingsLayout>
          <section aria-label="Settings child">settings child</section>
        </SettingsLayout>
      </AppProviders>
    )

    expect(screen.getByRole('region', { name: 'Settings child' })).toBeInTheDocument()
    expect(
      screen.queryByRole('complementary', { name: 'Workspace navigation' })
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-window-shell')).toHaveClass('h-screen', 'overflow-hidden')
    expect(screen.getByTestId('settings-window-shell')).not.toHaveClass('min-h-screen')
    expect(screen.queryByTestId('settings-window-drag-strip')).not.toBeInTheDocument()
  })
})
