import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../providers'

import { SettingsLayout, WorkspaceLayout } from './route-hosts'

describe('route layouts', () => {
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
    expect(screen.queryByRole('complementary', { name: 'Workspace navigation' })).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-window-shell')).toHaveClass('h-screen', 'overflow-hidden')
    expect(screen.getByTestId('settings-window-shell')).not.toHaveClass('min-h-screen')
  })
})
