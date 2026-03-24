import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsChrome } from './SettingsChrome'

describe('SettingsChrome', () => {
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

  it('renders the settings title with only the windows control cluster on the right', async () => {
    const user = userEvent.setup()

    render(<SettingsChrome title="提供商" />)

    expect(screen.getByRole('heading', { name: '提供商' })).toBeInTheDocument()
    expect(screen.queryByTestId('window-chrome-search-trigger')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '切换缩放窗口' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放大窗口' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭窗口' }))
    await user.click(screen.getByRole('button', { name: '最小化窗口' }))
    await user.click(screen.getByRole('button', { name: '放大窗口' }))

    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(minimizeMock).toHaveBeenCalledTimes(1)
    expect(toggleMaximizeMock).toHaveBeenCalledTimes(1)
  })
})
