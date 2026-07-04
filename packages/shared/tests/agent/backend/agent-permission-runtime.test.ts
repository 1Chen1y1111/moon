/**
 * 负责验证 AgentPermissionRuntime 的权限审批运行态编排。
 * 测试只覆盖 permission_request 入队、用户决策回传和 session grant 写入。
 */

import type { AgentPermissionRequest } from '@moon/core/types'
import { describe, expect, it } from 'vitest'

import { AgentPermissionRuntime } from '../../../src/agent/backend/agent-permission-runtime'
import { EventQueue } from '../../../src/agent/backend/event-queue'
import { createAgentSessionRuntimeState } from '../../../src/agent/core/session-runtime-state'

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

/**
 * 创建带空 session state 的 permission runtime。
 */
function createRuntime() {
  const agentSessionState = createAgentSessionRuntimeState()
  const runtime = new AgentPermissionRuntime({ agentSessionState })

  return { agentSessionState, runtime }
}

describe('AgentPermissionRuntime', () => {
  it('enqueues permission_request events with turn ids', async () => {
    const { runtime } = createRuntime()
    const eventQueue = new EventQueue()
    const request = createPermissionRequest()
    const decision = runtime.requestPermission({
      eventQueue,
      request,
      turnId: 'turn-1'
    })

    await expect(eventQueue.drain().next()).resolves.toMatchObject({
      value: {
        type: 'permission_request',
        turnId: 'turn-1',
        request
      },
      done: false
    })

    runtime.respondToPermission('permission-1', true)

    await expect(decision).resolves.toEqual({
      requestId: 'permission-1',
      approved: true
    })
  })

  it('returns a rejected decision when no active event queue exists', async () => {
    const { runtime } = createRuntime()

    await expect(
      runtime.requestPermission({
        eventQueue: null,
        request: createPermissionRequest(),
        turnId: null
      })
    ).resolves.toEqual({
      requestId: 'permission-1',
      approved: false,
      reason: 'No active agent event queue.'
    })
  })

  it('resolves approved and denied permission decisions', async () => {
    const { runtime } = createRuntime()
    const approveDecision = runtime.requestPermission({
      eventQueue: new EventQueue(),
      request: createPermissionRequest({ requestId: 'permission-1' }),
      turnId: null
    })
    const denyDecision = runtime.requestPermission({
      eventQueue: new EventQueue(),
      request: createPermissionRequest({ requestId: 'permission-2' }),
      turnId: null
    })

    runtime.respondToPermission('permission-1', true)
    runtime.respondToPermission('permission-2', false)

    await expect(approveDecision).resolves.toEqual({
      requestId: 'permission-1',
      approved: true
    })
    await expect(denyDecision).resolves.toEqual({
      requestId: 'permission-2',
      approved: false
    })
  })

  it('writes session grants for always-allow approvals', async () => {
    const { agentSessionState, runtime } = createRuntime()
    const decision = runtime.requestPermission({
      eventQueue: new EventQueue(),
      request: createPermissionRequest({ command: 'pnpm test' }),
      turnId: null
    })

    runtime.respondToPermission('permission-1', true, true)

    await expect(decision).resolves.toEqual({
      requestId: 'permission-1',
      approved: true,
      alwaysAllow: true
    })
    expect(agentSessionState.permissionGrants).toEqual([
      {
        type: 'bash',
        toolName: 'Bash',
        command: 'pnpm test'
      }
    ])
  })

  it('does not write session grants for one-time approvals', async () => {
    const { agentSessionState, runtime } = createRuntime()
    const decision = runtime.requestPermission({
      eventQueue: new EventQueue(),
      request: createPermissionRequest(),
      turnId: null
    })

    runtime.respondToPermission('permission-1', true)

    await expect(decision).resolves.toEqual({
      requestId: 'permission-1',
      approved: true
    })
    expect(agentSessionState.permissionGrants).toEqual([])
  })

  it('rejects all pending permission requests with the same reason', async () => {
    const { runtime } = createRuntime()
    const firstDecision = runtime.requestPermission({
      eventQueue: new EventQueue(),
      request: createPermissionRequest({ requestId: 'permission-1' }),
      turnId: null
    })
    const secondDecision = runtime.requestPermission({
      eventQueue: new EventQueue(),
      request: createPermissionRequest({ requestId: 'permission-2' }),
      turnId: null
    })

    runtime.rejectAll('Agent turn ended.')

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
  })
})
