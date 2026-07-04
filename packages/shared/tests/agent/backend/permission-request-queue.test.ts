/**
 * 负责验证 agent backend 权限请求队列的决策桥接语义。
 * 测试只覆盖 pending request 的 resolve/reject，不发送 AgentEvent 或触发 UI 审批。
 */

import { describe, expect, it } from 'vitest'

import { AgentPermissionRequestQueue } from '../../../src/agent/backend/permission-request-queue'
import type { AgentPermissionRequest } from '@moon/core/types'

/**
 * 创建权限请求测试数据，避免每个用例重复无关字段。
 */
function createPermissionRequest(
  overrides: Partial<AgentPermissionRequest> = {}
): AgentPermissionRequest {
  return {
    requestId: 'permission-1',
    toolName: 'Bash',
    description: '运行命令',
    command: 'pwd',
    type: 'bash',
    ...overrides
  }
}

describe('AgentPermissionRequestQueue', () => {
  it('resolves approved decisions', async () => {
    const queue = new AgentPermissionRequestQueue()
    const decision = queue.create(createPermissionRequest())

    expect(queue.respond('permission-1', true)).toMatchObject({
      decision: { requestId: 'permission-1', approved: true },
      request: { requestId: 'permission-1' }
    })
    await expect(decision).resolves.toEqual({
      requestId: 'permission-1',
      approved: true
    })
    expect(queue.size).toBe(0)
  })

  it('resolves denied decisions', async () => {
    const queue = new AgentPermissionRequestQueue()
    const decision = queue.create(createPermissionRequest())

    expect(queue.respond('permission-1', false)).toMatchObject({
      decision: { requestId: 'permission-1', approved: false },
      request: { requestId: 'permission-1' }
    })
    await expect(decision).resolves.toEqual({
      requestId: 'permission-1',
      approved: false
    })
    expect(queue.size).toBe(0)
  })

  it('returns the original request for always-allow approvals', async () => {
    const queue = new AgentPermissionRequestQueue()
    const request = createPermissionRequest({
      command: 'pnpm test'
    })
    const decision = queue.create(request)

    expect(queue.respond('permission-1', true, true)).toEqual({
      decision: {
        requestId: 'permission-1',
        approved: true,
        alwaysAllow: true
      },
      request
    })
    await expect(decision).resolves.toEqual({
      requestId: 'permission-1',
      approved: true,
      alwaysAllow: true
    })
    expect(queue.size).toBe(0)
  })

  it('ignores unknown request ids without resolving pending requests', async () => {
    const queue = new AgentPermissionRequestQueue()
    const decision = queue.create(createPermissionRequest())

    expect(queue.respond('missing-permission', true)).toBeNull()
    expect(queue.size).toBe(1)

    queue.respond('permission-1', false)

    await expect(decision).resolves.toEqual({
      requestId: 'permission-1',
      approved: false
    })
    expect(queue.size).toBe(0)
  })

  it('rejects all pending requests with the same reason', async () => {
    const queue = new AgentPermissionRequestQueue()
    const firstDecision = queue.create(createPermissionRequest({ requestId: 'permission-1' }))
    const secondDecision = queue.create(createPermissionRequest({ requestId: 'permission-2' }))

    queue.rejectAll('Agent turn ended.')

    await expect(firstDecision).resolves.toEqual({
      requestId: 'permission-1',
      approved: false,
      reason: 'Agent turn ended.'
    })
    await expect(secondDecision).resolves.toEqual({
      requestId: 'permission-2',
      approved: false,
      reason: 'Agent turn ended.'
    })
    expect(queue.size).toBe(0)
  })
})
