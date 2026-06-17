// @vitest-environment node

/**
 * 负责验证基础 agent runtime backend 的本地工具事件流。
 * 测试使用临时目录和 mock delegate，不访问真实模型 provider。
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createAgentRuntimeBackend } from '@main/services/agent-runtime-backend'
import type { AgentBackend, AgentEvent } from '@moon/shared/agent'

/**
 * 创建底层 LLM backend mock；非工具消息会透传到这里。
 */
function createDelegateBackend(
  events: AgentEvent[] = [{ type: 'text_delta', text: 'delegate' }]
): AgentBackend {
  return {
    async *chat(): AsyncGenerator<AgentEvent, void, void> {
      for (const event of events) {
        yield event
      }
    },
    abort: vi.fn(async () => {}),
    destroy: vi.fn(),
    getModel: vi.fn(() => 'test-model'),
    isProcessing: vi.fn(() => false),
    respondToPermission: vi.fn(),
    setModel: vi.fn()
  }
}

/**
 * 收集 backend 事件流，便于断言完整顺序。
 */
async function collectEvents(
  events: AsyncGenerator<AgentEvent, void, void>
): Promise<AgentEvent[]> {
  const collectedEvents: AgentEvent[] = []

  for await (const event of events) {
    collectedEvents.push(event)
  }

  return collectedEvents
}

/**
 * 创建带 fixture 文件的临时 workspace。
 */
async function createWorkspace(): Promise<string> {
  const workspacePath = await mkdtemp(join(tmpdir(), 'moon-agent-runtime-'))

  await writeFile(join(workspacePath, 'README.md'), 'hello moon')
  await mkdir(join(workspacePath, 'src'))
  await writeFile(join(workspacePath, 'src', 'index.ts'), 'export const value = 1')

  return workspacePath
}

describe('AgentRuntimeBackend', () => {
  it('passes non-tool messages through to the delegate backend', async () => {
    const delegate = createDelegateBackend()
    const backend = createAgentRuntimeBackend({ delegate })

    await expect(collectEvents(backend.chat('hello'))).resolves.toEqual([
      { type: 'text_delta', text: 'delegate' }
    ])
    expect(delegate.respondToPermission).not.toHaveBeenCalled()
  })

  it('runs /read inside the active workspace', async () => {
    const workspacePath = await createWorkspace()
    const backend = createAgentRuntimeBackend({
      delegate: createDelegateBackend(),
      workspace: { name: 'moon', path: workspacePath }
    })
    const events = await collectEvents(backend.chat('/read README.md'))

    expect(events.map((event) => event.type)).toEqual(['tool_start', 'tool_result', 'text_delta'])
    expect(events[1]).toMatchObject({
      type: 'tool_result',
      isError: false,
      result: expect.objectContaining({ output: 'hello moon' })
    })
    expect(events[2]).toMatchObject({
      type: 'text_delta',
      text: expect.stringContaining('hello moon')
    })
  })

  it('runs /ls inside the active workspace', async () => {
    const workspacePath = await createWorkspace()
    const backend = createAgentRuntimeBackend({
      delegate: createDelegateBackend(),
      workspace: { name: 'moon', path: workspacePath }
    })
    const events = await collectEvents(backend.chat('/ls .'))

    expect(events[1]).toMatchObject({
      type: 'tool_result',
      isError: false,
      result: expect.objectContaining({
        output: expect.stringContaining('README.md')
      })
    })
  })

  it('waits for approval before running /bash', async () => {
    const workspacePath = await createWorkspace()
    const backend = createAgentRuntimeBackend({
      delegate: createDelegateBackend(),
      workspace: { name: 'moon', path: workspacePath }
    })
    const events = backend.chat('/bash echo approved')
    const permissionRequest = await events.next()

    expect(permissionRequest.value).toMatchObject({
      type: 'permission_request',
      request: expect.objectContaining({
        command: 'echo approved',
        toolName: 'bash'
      })
    })

    if (permissionRequest.value?.type === 'permission_request') {
      backend.respondToPermission(permissionRequest.value.request.requestId, true, false)
    }

    const remainingEvents = await collectEvents(events)

    expect(remainingEvents.map((event) => event.type)).toEqual([
      'tool_start',
      'tool_result',
      'text_delta'
    ])
    expect(remainingEvents[1]).toMatchObject({
      type: 'tool_result',
      isError: false,
      result: expect.objectContaining({
        output: expect.stringContaining('approved')
      })
    })
  })

  it('stops /bash when permission is rejected', async () => {
    const workspacePath = await createWorkspace()
    const backend = createAgentRuntimeBackend({
      delegate: createDelegateBackend(),
      workspace: { name: 'moon', path: workspacePath }
    })
    const events = backend.chat('/bash echo rejected')
    const permissionRequest = await events.next()

    if (permissionRequest.value?.type === 'permission_request') {
      backend.respondToPermission(permissionRequest.value.request.requestId, false, false)
    }

    await expect(collectEvents(events)).resolves.toEqual([
      { type: 'text_delta', text: '工具执行已拒绝。' }
    ])
  })
})
