import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HomeEmptyState } from './HomeEmptyState'

describe('HomeEmptyState', () => {
  it('renders New Chat, Configure Provider, and Settings actions', () => {
    render(<HomeEmptyState />)

    expect(screen.getByRole('button', { name: 'New Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configure Provider' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })
})
