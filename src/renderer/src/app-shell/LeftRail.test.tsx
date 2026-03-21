import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LeftRail } from './LeftRail'

describe('LeftRail', () => {
  it('renders the Alma floating rail assets', () => {
    render(<LeftRail />)

    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '搜索' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '筛选' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '布局' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '清除历史' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建聊天' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument()
  })
})
