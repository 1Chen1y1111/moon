// @vitest-environment node

/**
 * 负责验证 preload envelope IPC client 的统一 rpc:request/rpc:event 适配行为。
 * 测试只覆盖 preload 内部 transport，不触发真实 Electron、renderer 或主进程 handler。
 */

import { describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '@ipc/channels'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import { createEnvelopeIpcRpcClient } from '@preload/envelope-ipc-rpc-client'

function createIpcRendererFixture(): {
  ipcRenderer: Parameters<typeof createEnvelopeIpcRpcClient>[0]
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
    } as unknown as Parameters<typeof createEnvelopeIpcRpcClient>[0],
    invoke,
    on,
    off
  }
}

describe('createEnvelopeIpcRpcClient', () => {
  it('sends session invoke envelopes through rpc:request', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createEnvelopeIpcRpcClient(ipcRenderer, { createId: () => 'request-1' })
    const input = { sessionId: 'session-1' }

    invoke.mockResolvedValue({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.getMessages,
      result: [{ id: 'message-1' }]
    })

    await expect(client.invoke(RPC_CHANNELS.sessions.getMessages, input)).resolves.toEqual([
      { id: 'message-1' }
    ])
    expect(invoke).toHaveBeenCalledWith(ipcChannels.rpc.request, {
      id: 'request-1',
      type: 'request',
      channel: RPC_CHANNELS.sessions.getMessages,
      args: [input]
    })
  })

  it('sends app-shell invoke envelopes through rpc:request', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createEnvelopeIpcRpcClient(ipcRenderer, { createId: () => 'request-1' })
    const input = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    }

    invoke.mockResolvedValue({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.settings.saveProvider,
      result: { providers: [] }
    })

    await expect(client.invoke(RPC_CHANNELS.settings.saveProvider, input)).resolves.toEqual({
      providers: []
    })
    expect(invoke).toHaveBeenCalledWith(ipcChannels.rpc.request, {
      id: 'request-1',
      type: 'request',
      channel: RPC_CHANNELS.settings.saveProvider,
      args: [input]
    })
  })

  it('does not pass undefined for envelope invokes without args', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createEnvelopeIpcRpcClient(ipcRenderer, { createId: () => 'request-1' })

    invoke.mockResolvedValue({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.listSessions,
      result: []
    })

    await expect(client.invoke(RPC_CHANNELS.sessions.listSessions)).resolves.toEqual([])
    expect(invoke).toHaveBeenCalledWith(ipcChannels.rpc.request, {
      id: 'request-1',
      type: 'request',
      channel: RPC_CHANNELS.sessions.listSessions,
      args: []
    })
    expect(invoke).not.toHaveBeenCalledWith(ipcChannels.rpc.request, undefined)
  })

  it('turns IPC rejections into coded client errors', async () => {
    const { ipcRenderer, invoke } = createIpcRendererFixture()
    const client = createEnvelopeIpcRpcClient(ipcRenderer, { createId: () => 'request-1' })
    const error = new Error('too slow') as Error & { code: string }

    error.code = 'REQUEST_TIMEOUT'
    invoke.mockRejectedValue(error)

    await expect(client.invoke(RPC_CHANNELS.sessions.runOperation, { operationId: 'op-1' })).rejects
      .toMatchObject({
        message: 'too slow',
        code: 'REQUEST_TIMEOUT'
      })
  })

  it('expands session event envelopes to listeners', () => {
    const { ipcRenderer, on, off } = createIpcRendererFixture()
    const client = createEnvelopeIpcRpcClient(ipcRenderer, { createId: () => 'event-1' })
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
    const handler = on.mock.calls.find(([channel]) => channel === ipcChannels.rpc.event)?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.(
      {},
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      }
    )
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(event)
    expect(off).toHaveBeenCalledWith(ipcChannels.rpc.event, handler)
  })

  it('expands app-shell event envelopes to listeners', () => {
    const { ipcRenderer, on, off } = createIpcRendererFixture()
    const client = createEnvelopeIpcRpcClient(ipcRenderer, { createId: () => 'event-1' })
    const listener = vi.fn()
    const settings = { appearance: { theme: 'dark' } }

    const unsubscribe = client.on(RPC_CHANNELS.settings.onChange, listener)
    const handler = on.mock.calls.find(([channel]) => channel === ipcChannels.rpc.event)?.[1]

    expect(handler).toBeTypeOf('function')

    handler?.(
      {},
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.settings.onChange,
        args: [settings]
      }
    )
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(settings)
    expect(off).toHaveBeenCalledWith(ipcChannels.rpc.event, handler)
  })

  it('ignores events from other RPC event channels after envelope filtering', () => {
    const { ipcRenderer, on } = createIpcRendererFixture()
    const client = createEnvelopeIpcRpcClient(ipcRenderer, { createId: () => 'event-1' })
    const listener = vi.fn()

    client.on(RPC_CHANNELS.sessions.event, listener)

    const settingsHandler = on.mock.calls.find(([channel]) => channel === ipcChannels.rpc.event)?.[1]

    expect(settingsHandler).toBeTypeOf('function')

    settingsHandler?.(
      {},
      {
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.settings.onChange,
        args: [{ theme: 'dark' }]
      }
    )

    expect(listener).not.toHaveBeenCalled()
  })
})
