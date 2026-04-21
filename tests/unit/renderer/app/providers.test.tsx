import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '@renderer/app/providers'
import { useAppSelector } from '@renderer/app/store/hooks'

function SettingsProbe(): React.JSX.Element {
  const activeSection = useAppSelector((state) => state.settings.activeSection)
  return <span>{activeSection}</span>
}

describe('AppProviders', () => {
  it('provides the Redux store to renderer children', () => {
    render(
      <AppProviders>
        <SettingsProbe />
      </AppProviders>
    )

    expect(screen.getByText('general')).toBeInTheDocument()
  })
})
