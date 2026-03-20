import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@renderer/components/ui/button'
import { HomeEmptyState } from './HomeEmptyState'

describe('HomeEmptyState', () => {
  it('renders the alma-style empty state actions and copy', () => {
    render(<HomeEmptyState />)

    expect(screen.getByText('Moon')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How can I help you today?' })).toBeInTheDocument()
    expect(
      screen.getByText('Start a fresh conversation, connect a provider, or adjust settings.')
    ).toBeInTheDocument()
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

  it('uses shell-sized layout with centered content and a bottom composer', () => {
    render(<HomeEmptyState />)

    const section = screen.getByRole('region', { name: 'Home empty state' })
    const composer = screen.getByRole('textbox', { name: 'Message composer' })

    expect(section).toHaveClass('min-h-full')
    expect(section).not.toHaveClass('min-h-screen')
    expect(section).not.toHaveClass('w-screen')
    expect(composer).toHaveAttribute('placeholder', 'Message Moon...')
    expect(composer).toHaveAttribute('readonly')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('defaults Button type to button when type is not provided', () => {
    render(<Button>Quick Action</Button>)

    expect(screen.getByRole('button', { name: 'Quick Action' })).toHaveAttribute('type', 'button')
  })
})
