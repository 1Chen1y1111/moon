import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { LeftRail } from './LeftRail'
import { useSettingsStore } from '@renderer/lib/stores/settings-store'
import { useUiStore } from '@renderer/lib/stores/ui-store'

describe('LeftRail', () => {
  beforeEach(() => {
    useUiStore.setState({
      isProviderSetupDialogOpen: false,
      isSettingsDialogOpen: false
    })
    useSettingsStore.setState({
      providerDrafts: {
        claude: {
          apiKey: '',
          model: ''
        }
      },
      activeSettingsSection: 'general'
    })
  })

  it('renders the Alma floating rail assets', () => {
    render(<LeftRail />)

    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.getByText('清除历史')).toBeInTheDocument()
    expect(screen.getByText('新建聊天')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument()
  })
})
