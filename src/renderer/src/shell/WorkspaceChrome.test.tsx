import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceChrome } from './WorkspaceChrome'

describe('WorkspaceChrome', () => {
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
        toggleMaximize: toggleMaximizeMock,
        openSettings: vi.fn(),
        getState: vi.fn().mockResolvedValue({ isMaximized: false }),
        onStateChange: vi.fn().mockReturnValue(() => undefined)
      }
    }
  })

  it('renders mac window controls and workspace utility actions together', async () => {
    const user = userEvent.setup()

    render(<WorkspaceChrome />)

    await user.click(screen.getByRole('button', { name: '关闭窗口' }))
    await user.click(screen.getByRole('button', { name: '最小化窗口' }))
    await user.click(screen.getByRole('button', { name: '切换缩放窗口' }))

    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(minimizeMock).toHaveBeenCalledTimes(1)
    expect(toggleMaximizeMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()
  })
})
