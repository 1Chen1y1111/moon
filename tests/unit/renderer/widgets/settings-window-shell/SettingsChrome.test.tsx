import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SettingsChrome } from '@renderer/widgets/settings-window-shell/SettingsChrome'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'

describe('SettingsChrome', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi()
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

    expect(api.windowControls.close).toHaveBeenCalledTimes(1)
    expect(api.windowControls.minimize).toHaveBeenCalledTimes(1)
    expect(api.windowControls.toggleMaximize).toHaveBeenCalledTimes(1)
  })
})
