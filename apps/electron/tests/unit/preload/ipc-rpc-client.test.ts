// @vitest-environment node

/**
 * 负责验证 preload IPC RPC client 的 session channel 映射。
 * 测试只覆盖 preload transport adapter，不触发真实 Electron 或 renderer。
 */

import { describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import { createIpcRpcClient } from '@preload/ipc-rpc-client'

function createIpcRendererFixture(): {
  ipcRenderer: Parameters<typeof createIpcRpcClient>[0]
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
} {
  const invoke = vi.fn()
  const on = vi.fn()
  const off = vi.fn()

  return {
    ipcRenderer: {
      invoke,
      on,
      off
    } as unknown as Parameters<typeof createIpcRpcClient>[0],
    invoke,
    on,
    off
  }
}

describe('createIpcRpcClient', () => {
  it('maps session invoke channels to legacy chat IPC channels', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createIpcRpcClient(ipcRenderer)
    const input = { sessionId: 'session-1' }

    invoke.mockResolvedValue([{ id: 'message-1' }])

    await expect(client.invoke(RPC_CHANNELS.sessions.getMessages, input)).resolves.toEqual([
      { id: 'message-1' }
    ])
    expect(invoke).toHaveBeenCalledWith(ipcChannels.chat.getMessages, input)
  })

  it('does not pass undefined for invokes without args', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createIpcRpcClient(ipcRenderer)

    invoke.mockResolvedValue([])

    await expect(client.invoke(RPC_CHANNELS.sessions.listSessions)).resolves.toEqual([])
    expect(invoke).toHaveBeenCalledWith(ipcChannels.chat.listSessions)
    expect(invoke).not.toHaveBeenCalledWith(ipcChannels.chat.listSessions, undefined)
  })

  it('maps session:event subscriptions to the unified IPC event channel', () => {
    const { ipcRenderer, on, off } = createIpcRendererFixture()
    const client = createIpcRpcClient(ipcRenderer)
    const listener = vi.fn()
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    }

    const unsubscribe = client.on(RPC_CHANNELS.sessions.event, listener)
    const handler = on.mock.calls.find(
      ([channel]) => channel === ipcChannels.chat.sessionEvent
    )?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.({}, event)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(off).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, handler)
  })
})
