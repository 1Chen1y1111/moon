import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LeftRail } from './LeftRail'

describe('LeftRail', () => {
  it('renders labelled controls for New Chat and Settings', () => {
    render(<LeftRail />)

    expect(screen.getByRole('button', { name: 'New Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })
})
