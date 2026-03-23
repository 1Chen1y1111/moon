import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useAppSelector } from './store/hooks'
import { AppProviders } from './providers'

function SettingsProbe(): React.JSX.Element {
  const isOpen = useAppSelector((state) => state.settings.isOpen)
  return <span>{isOpen ? 'open' : 'closed'}</span>
}

describe('AppProviders', () => {
  it('provides the Redux store to renderer children', () => {
    render(
      <AppProviders>
        <SettingsProbe />
      </AppProviders>
    )

    expect(screen.getByText('closed')).toBeInTheDocument()
  })
})
