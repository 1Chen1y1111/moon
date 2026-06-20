// @vitest-environment node

/**
 * 负责验证 Electron sessions IPC adapter 会通过内部 envelope dispatcher 保持旧 IPC 行为。
 * 测试只覆盖 transport adapter，不触发真实 Electron、renderer 或会话运行时。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatOperationEvent } from '@moon/shared/domain/chat'

const handleMock = vi.fn()
const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  },
  ipcMain: {
    handle: handleMock
  }
}))

function getRegisteredHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  return handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
}

function createOperationEvent(): ChatOperationEvent {
  const timestamp = '2026-05-09T00:00:00.000Z'
  const session = {
    id: 'session-1',
    projectId: null,
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies ChatOperationEvent['session']
  const topic = {
    id: 'topic-1',
    sessionId: 'session-1',
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies ChatOperationEvent['topic']
  const thread = {
    id: 'thread-1',
    topicId: 'topic-1',
    title: 'Moon',
    type: 'standalone',
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies ChatOperationEvent['thread']
  const message = {
    id: 'message-1',
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    operationId: 'operation-1',
    role: 'assistant',
    content: 'ok',
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies ChatOperationEvent['message']

  return {
    type: 'message-created',
    operationId: 'operation-1',
    session,
    topic,
    thread,
    message
  }
}

describe('createSessionIpcRpcServer', () => {
  beforeEach(() => {
    handleMock.mockReset()
    getAllWindowsMock.mockReset()
  })

  it('returns legacy IPC results through the envelope dispatcher', async () => {
    const { createSessionIpcRpcServer } = await import('@main/bootstrap/session-ipc-adapter')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const rpcServer = createSessionIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.listSessions, () => [{ id: 'session-1' }])

    const registeredHandler = getRegisteredHandler(ipcChannels.chat.listSessions)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(registeredHandler?.({ sender: { id: 1, send: vi.fn() } })).resolves.toEqual([
      { id: 'session-1' }
    ])
  })

  it('maps runOperation session:event emissions to the unified event channel', async () => {
    const { createSessionIpcRpcServer } = await import('@main/bootstrap/session-ipc-adapter')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const operationEvent = createOperationEvent()
    const sender = { id: 2, send: vi.fn() }
    const otherWebContents = { id: 1, send: vi.fn() }
    const senderWebContents = { id: 2, send: vi.fn() }
    const rpcServer = createSessionIpcRpcServer()

    getAllWindowsMock.mockReturnValue([
      { webContents: otherWebContents },
      { webContents: senderWebContents }
    ])

    rpcServer.handle(RPC_CHANNELS.sessions.runOperation, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent)

      return input
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.chat.runOperation)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(registeredHandler?.({ sender }, { operationId: 'op-1' })).resolves.toEqual({
      operationId: 'op-1'
    })
    expect(sender.send).not.toHaveBeenCalled()
    expect(otherWebContents.send).not.toHaveBeenCalled()
    expect(senderWebContents.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, operationEvent)
    expect(senderWebContents.send).toHaveBeenCalledTimes(1)
  })

  it('maps sendMessage session:event emissions to the unified event channel', async () => {
    const { createSessionIpcRpcServer } = await import('@main/bootstrap/session-ipc-adapter')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const operationEvent = createOperationEvent()
    const sender = { id: 2, send: vi.fn() }
    const otherWebContents = { id: 1, send: vi.fn() }
    const senderWebContents = { id: 2, send: vi.fn() }
    const rpcServer = createSessionIpcRpcServer()

    getAllWindowsMock.mockReturnValue([
      { webContents: otherWebContents },
      { webContents: senderWebContents }
    ])

    rpcServer.handle(RPC_CHANNELS.sessions.sendMessage, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent)

      return input
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.chat.sendMessage)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(registeredHandler?.({ sender }, { content: 'hello' })).resolves.toEqual({
      content: 'hello'
    })
    expect(sender.send).not.toHaveBeenCalled()
    expect(otherWebContents.send).not.toHaveBeenCalled()
    expect(senderWebContents.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, operationEvent)
    expect(senderWebContents.send).toHaveBeenCalledTimes(1)
  })

  it('rejects legacy IPC calls with HANDLER_ERROR for ordinary handler errors', async () => {
    const { createSessionIpcRpcServer } = await import('@main/bootstrap/session-ipc-adapter')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const rpcServer = createSessionIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.getMessages, () => {
      throw new Error('boom')
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.chat.getMessages)

    expect(registeredHandler).toBeTypeOf('function')

    try {
      await registeredHandler?.({ sender: { id: 1, send: vi.fn() } }, { sessionId: 'session-1' })
      throw new Error('expected handler to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('boom')
      expect((error as Error & { code?: string }).code).toBe('HANDLER_ERROR')
    }
  })

  it('preserves CodedError codes when legacy IPC calls reject', async () => {
    const { createSessionIpcRpcServer } = await import('@main/bootstrap/session-ipc-adapter')
    const { ipcChannels } = await import('@ipc/channels')
    const { CodedError, RPC_CHANNELS } = await import('@moon/shared/protocol')
    const rpcServer = createSessionIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.cancelOperation, () => {
      throw new CodedError('REQUEST_TIMEOUT', 'too slow')
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.chat.cancelOperation)

    expect(registeredHandler).toBeTypeOf('function')

    try {
      await registeredHandler?.({ sender: { id: 1, send: vi.fn() } }, { operationId: 'operation-1' })
      throw new Error('expected handler to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('too slow')
      expect((error as Error & { code?: string }).code).toBe('REQUEST_TIMEOUT')
    }
  })
})
