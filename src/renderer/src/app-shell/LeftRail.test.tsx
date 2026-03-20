import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LeftRail } from './LeftRail'

describe('LeftRail', () => {
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
})
