/**
 * 负责验证消息工具卡片的人工审批入口。
 * 测试只覆盖 renderer 交互，不触发真实 Electron IPC。
 */

import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ToolInvocationList } from '@renderer/features/Conversation/Messages/Tool'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import type { ToolInvocationRecord } from '@moon/shared/domain/chat'

function createToolInvocation(input: Partial<ToolInvocationRecord> = {}): ToolInvocationRecord {
  return {
    id: 'permission-tool-1',
    operationId: 'operation-1',
    messageId: 'message-2',
    name: 'Bash',
    arguments: {
      description: '需要执行测试命令',
      command: 'pnpm test'
    },
    status: 'waiting_for_human',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    ...input
  }
}

describe('ToolInvocationList', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi()
  })

  it('approves a waiting tool invocation from the message card', async () => {
    const { user } = renderWithProviders(
      <ToolInvocationList toolInvocations={[createToolInvocation()]} />
    )

    expect(screen.getByText('等待确认')).toBeInTheDocument()
    expect(screen.getByText('需要执行测试命令')).toBeInTheDocument()
    expect(screen.getByText('pnpm test')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '允许' }))

    await waitFor(() =>
      expect(api.sessions.approveToolCall).toHaveBeenCalledWith({
        toolInvocationId: 'permission-tool-1'
      })
    )
  })

  it('rejects a waiting tool invocation from the message card', async () => {
    const { user } = renderWithProviders(
      <ToolInvocationList toolInvocations={[createToolInvocation()]} />
    )

    await user.click(screen.getByRole('button', { name: '拒绝' }))

    await waitFor(() =>
      expect(api.sessions.rejectToolCall).toHaveBeenCalledWith({
        toolInvocationId: 'permission-tool-1'
      })
    )
  })

  it('renders file write permission path and impact from intervention metadata', () => {
    renderWithProviders(
      <ToolInvocationList
        toolInvocations={[
          createToolInvocation({
            name: 'Edit',
            arguments: {
              description: '需要修改项目文件：README.md',
              path: 'README.md',
              impact: '写操作会改变当前项目工作区文件。'
            },
            intervention: {
              type: 'permission_request',
              description: '需要修改项目文件：README.md',
              path: 'README.md',
              impact: '写操作会改变当前项目工作区文件。'
            }
          })
        ]}
      />
    )

    expect(screen.getByText('需要修改项目文件：README.md')).toBeInTheDocument()
    expect(screen.getByText('写操作会改变当前项目工作区文件。')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('hides approval actions after a tool invocation is resolved', () => {
    renderWithProviders(
      <ToolInvocationList
        toolInvocations={[createToolInvocation({ result: { approved: true }, status: 'done' })]}
      />
    )

    expect(screen.getByText('已允许')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '允许' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument()
  })

  it('renders tool output from the result payload', () => {
    renderWithProviders(
      <ToolInvocationList
        toolInvocations={[
          createToolInvocation({
            arguments: { path: '.' },
            name: 'LS',
            result: {
              title: '目录列表：.',
              output: 'dir apps\nfile package.json'
            },
            status: 'done'
          })
        ]}
      />
    )

    expect(screen.getByText('目录列表：.')).toBeInTheDocument()
    expect(screen.getByText(/dir apps/)).toBeInTheDocument()
    expect(screen.getByText(/file package.json/)).toBeInTheDocument()
  })
})
