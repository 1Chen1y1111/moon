import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@renderer/components/ui/button'
import { HomeEmptyState } from './HomeEmptyState'

describe('HomeEmptyState', () => {
  it('renders New Chat, Configure Provider, and Settings actions', () => {
    render(<HomeEmptyState />)

    expect(screen.getByRole('button', { name: 'New Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Chat' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Configure Provider' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configure Provider' })).toHaveAttribute(
      'type',
      'button'
    )
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('type', 'button')
  })

  it('defaults Button type to button when type is not provided', () => {
    render(<Button>Quick Action</Button>)

    expect(screen.getByRole('button', { name: 'Quick Action' })).toHaveAttribute('type', 'button')
  })
})
