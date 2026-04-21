import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { WorkspaceChrome } from '@renderer/widgets/workspace-shell/WorkspaceChrome'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'

describe('WorkspaceChrome', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi()
  })

  it('renders mac window controls and workspace utility actions together', async () => {
    const user = userEvent.setup()

    render(<WorkspaceChrome />)

    await user.click(screen.getByRole('button', { name: '关闭窗口' }))
    await user.click(screen.getByRole('button', { name: '最小化窗口' }))
    await user.click(screen.getByRole('button', { name: '切换缩放窗口' }))

    expect(screen.getByTestId('mac-window-control-close-icon')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-70'
    )
    expect(screen.getByTestId('mac-window-control-minimize-icon')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-70'
    )
    expect(screen.getByTestId('mac-window-control-maximize-icon')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-70'
    )
    expect(api.windowControls.close).toHaveBeenCalledTimes(1)
    expect(api.windowControls.minimize).toHaveBeenCalledTimes(1)
    expect(api.windowControls.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-search-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('window-chrome-compose-trigger')).toBeInTheDocument()
  })
})
