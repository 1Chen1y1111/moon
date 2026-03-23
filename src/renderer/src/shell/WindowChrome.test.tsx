import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WindowChrome } from './WindowChrome'

describe('WindowChrome', () => {
  const closeMock = vi.fn()
  const minimizeMock = vi.fn()
  const toggleMaximizeMock = vi.fn()

  beforeEach(() => {
    closeMock.mockReset()
    minimizeMock.mockReset()
    toggleMaximizeMock.mockReset()
    ;(window as Window & { api: Record<string, unknown> }).api = {
      settings: {
        get: vi.fn(),
        saveProvider: vi.fn()
      },
      windowControls: {
        close: closeMock,
        minimize: minimizeMock,
        toggleMaximize: toggleMaximizeMock
      }
    }
  })

  it('invokes native window control actions from the sidebar traffic lights', async () => {
    const user = userEvent.setup()

    render(<WindowChrome />)

    await user.click(screen.getByRole('button', { name: '关闭窗口' }))
    await user.click(screen.getByRole('button', { name: '最小化窗口' }))
    await user.click(screen.getByRole('button', { name: '切换缩放窗口' }))

    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(minimizeMock).toHaveBeenCalledTimes(1)
    expect(toggleMaximizeMock).toHaveBeenCalledTimes(1)
  })

  it('renders sidebar utility icon cards with portal tooltips on hover', async () => {
    const user = userEvent.setup()

    render(<WindowChrome />)

    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()

    await user.hover(screen.getByTestId('window-chrome-collapse-trigger'))
    expect(await screen.findByRole('tooltip', { name: '折叠侧边栏' })).toBeInTheDocument()
  })
})
