// @vitest-environment node

/**
 * 负责验证 Electron sessions IPC adapter 的旧事件通道兼容映射。
 * 测试只覆盖 transport adapter，不触发真实 Electron、renderer 或会话运行时。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatOperationEvent } from '@moon/shared/domain/chat'

const handleMock = vi.fn()

vi.mock('electron', () => ({
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
  })

  it('maps runOperation session:event emissions to unified and legacy operation event channels', async () => {
    const { createSessionIpcRpcServer } = await import('@main/bootstrap/session-ipc-adapter')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const operationEvent = createOperationEvent()
    const sender = { send: vi.fn() }
    const rpcServer = createSessionIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.runOperation, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent)

      return input
    })

    expect(
      getRegisteredHandler(ipcChannels.chat.runOperation)?.({ sender }, { operationId: 'op-1' })
    ).toEqual({ operationId: 'op-1' })
    expect(sender.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, operationEvent)
    expect(sender.send).toHaveBeenCalledWith(ipcChannels.chat.operationEvent, operationEvent)
  })

  it('maps sendMessage session:event emissions to unified and legacy send message event channels', async () => {
    const { createSessionIpcRpcServer } = await import('@main/bootstrap/session-ipc-adapter')
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const operationEvent = createOperationEvent()
    const sender = { send: vi.fn() }
    const rpcServer = createSessionIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.sendMessage, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent)

      return input
    })

    expect(
      getRegisteredHandler(ipcChannels.chat.sendMessage)?.({ sender }, { content: 'hello' })
    ).toEqual({ content: 'hello' })
    expect(sender.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, operationEvent)
    expect(sender.send).toHaveBeenCalledWith(ipcChannels.chat.sendMessageEvent, operationEvent)
  })
})
