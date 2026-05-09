import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { WorkspaceChrome } from '@renderer/widgets/workspace-shell/WorkspaceChrome'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'

describe('WorkspaceChrome', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi()
  })

  it('renders mac window controls and workspace utility actions together', async () => {
    const user = userEvent.setup()

    renderWithProviders(<WorkspaceChrome />)

    expect(screen.getByRole('banner')).toHaveClass('[-webkit-app-region:drag]', 'p-3')
    expect(screen.getByRole('banner')).not.toHaveClass('h-moon-chrome')

    await user.click(screen.getByRole('button', { name: '关闭窗口' }))
    await user.click(screen.getByRole('button', { name: '最小化窗口' }))
    await user.click(screen.getByRole('button', { name: '切换缩放窗口' }))

    expect(screen.getByTestId('mac-window-control-close-icon').closest('div')).toHaveClass(
      '[-webkit-app-region:no-drag]',
      'relative',
      'z-20'
    )
    expect(screen.getByTestId('mac-window-control-close-icon').closest('button')).not.toHaveClass(
      'hover:brightness-75'
    )
    expect(screen.getByTestId('mac-window-control-close-icon')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-70'
    )
    expect(screen.getByTestId('mac-window-control-close-icon')).toHaveAttribute('stroke', '#171717')
    expect(screen.getByTestId('mac-window-control-minimize-icon')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-70'
    )
    expect(screen.getByTestId('mac-window-control-minimize-icon')).toHaveAttribute(
      'stroke',
      '#171717'
    )
    expect(screen.getByTestId('mac-window-control-maximize-icon')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-70'
    )
    expect(screen.getByTestId('mac-window-control-maximize-icon')).toHaveAttribute(
      'stroke',
      '#171717'
    )
    expect(api.windowControls.close).toHaveBeenCalledTimes(1)
    expect(api.windowControls.minimize).toHaveBeenCalledTimes(1)
    expect(api.windowControls.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()

    for (const trigger of [
      screen.getByTestId('window-chrome-collapse-trigger'),
      screen.getByTestId('window-chrome-search-trigger'),
      screen.getByTestId('window-chrome-compose-trigger')
    ]) {
      const utilityCard = trigger.firstElementChild as HTMLElement

      expect(trigger.parentElement).toHaveClass('[-webkit-app-region:no-drag]', 'relative', 'z-20')
      expect(utilityCard).toHaveClass(
        'border-transparent',
        'group-hover:border-input',
        'group-hover:bg-accent',
        'group-hover:text-foreground'
      )
      expect(utilityCard).not.toHaveClass(
        'group-hover:text-moon-fg-inverse',
        'group-hover:shadow-moon-ring'
      )
    }
  })
})
