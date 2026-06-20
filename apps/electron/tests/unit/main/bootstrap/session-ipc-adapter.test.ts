// @vitest-environment node

/**
 * 负责验证 Electron sessions IPC adapter 会通过 workspace envelope IPC 分发请求和事件。
 * 测试只覆盖 transport adapter，不触发真实 Electron、renderer 或会话运行时。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatOperationEvent } from '@moon/shared/domain/chat'

type MessageCreatedEvent = Extract<ChatOperationEvent, { type: 'message-created' }>
type OperationDoneEvent = Extract<ChatOperationEvent, { type: 'operation-done' }>
type MessageDeltaEvent = Extract<ChatOperationEvent, { type: 'message-delta' }>

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

function createMessageCreatedEvent(projectId: string | null = null): MessageCreatedEvent {
  const timestamp = '2026-05-09T00:00:00.000Z'
  const session = {
    id: 'session-1',
    projectId,
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies MessageCreatedEvent['session']
  const topic = {
    id: 'topic-1',
    sessionId: 'session-1',
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies MessageCreatedEvent['topic']
  const thread = {
    id: 'thread-1',
    topicId: 'topic-1',
    title: 'Moon',
    type: 'standalone',
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies MessageCreatedEvent['thread']
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
  } satisfies MessageCreatedEvent['message']

  return {
    type: 'message-created',
    operationId: 'operation-1',
    session,
    topic,
    thread,
    message
  }
}

function createOperationDoneEvent(projectId: string): OperationDoneEvent {
  const timestamp = '2026-05-09T00:00:00.000Z'
  const event = createMessageCreatedEvent(projectId)

  return {
    type: 'operation-done',
    operationId: 'operation-1',
    session: event.session,
    topic: event.topic,
    thread: event.thread,
    operation: {
      id: 'operation-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      status: 'done',
      createdAt: timestamp,
      updatedAt: timestamp
    },
    messages: [event.message]
  }
}

function createMessageDeltaEvent(): MessageDeltaEvent {
  return {
    type: 'message-delta',
    operationId: 'operation-1',
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    messageId: 'message-1',
    delta: 'hello'
  }
}

function createRequestEnvelope(channel: string, args: unknown[] = []) {
  return {
    id: 'request-1',
    type: 'request',
    channel,
    args
  }
}

describe('createElectronEnvelopeIpcRpcServer session behavior', () => {
  beforeEach(() => {
    handleMock.mockReset()
    getAllWindowsMock.mockReset()
  })

  it('returns response envelopes through the workspace IPC dispatcher', async () => {
    const { createElectronEnvelopeIpcRpcServer } = await import(
      '@main/bootstrap/electron-envelope-ipc-rpc-server'
    )
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const rpcServer = createElectronEnvelopeIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.listSessions, () => [{ id: 'session-1' }])

    const registeredHandler = getRegisteredHandler(ipcChannels.rpc.request)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(
      registeredHandler?.(
        { sender: { id: 1, send: vi.fn() } },
        createRequestEnvelope(RPC_CHANNELS.sessions.listSessions)
      )
    ).resolves.toEqual({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.listSessions,
      result: [{ id: 'session-1' }]
    })
  })

  it('routes session events with direct projectId to workspace clients', async () => {
    const { createElectronEnvelopeIpcRpcServer } = await import(
      '@main/bootstrap/electron-envelope-ipc-rpc-server'
    )
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { bindLegacyWebContentsClientWorkspace } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const messageCreatedEvent = createMessageCreatedEvent('project-1')
    const operationDoneEvent = createOperationDoneEvent('project-1')
    const sender = { id: 302, send: vi.fn() }
    const sameWorkspaceWebContents = { id: 301, send: vi.fn() }
    const senderWebContents = { id: 302, send: vi.fn() }
    const otherWorkspaceWebContents = { id: 303, send: vi.fn() }
    const rpcServer = createElectronEnvelopeIpcRpcServer()

    getAllWindowsMock.mockReturnValue([
      { webContents: sameWorkspaceWebContents },
      { webContents: senderWebContents },
      { webContents: otherWorkspaceWebContents }
    ])
    bindLegacyWebContentsClientWorkspace(sameWorkspaceWebContents, 'project-1')
    bindLegacyWebContentsClientWorkspace(senderWebContents, 'project-1')
    bindLegacyWebContentsClientWorkspace(otherWorkspaceWebContents, 'project-2')

    rpcServer.handle(RPC_CHANNELS.sessions.runOperation, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, messageCreatedEvent)
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationDoneEvent)

      return input
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.rpc.request)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(
      registeredHandler?.(
        { sender },
        createRequestEnvelope(RPC_CHANNELS.sessions.runOperation, [{ operationId: 'op-1' }])
      )
    ).resolves.toMatchObject({
      channel: RPC_CHANNELS.sessions.runOperation,
      result: { operationId: 'op-1' }
    })
    expect(sender.send).not.toHaveBeenCalled()
    expect(sameWorkspaceWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [messageCreatedEvent],
        workspaceId: 'project-1'
      })
    )
    expect(sameWorkspaceWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [operationDoneEvent],
        workspaceId: 'project-1'
      })
    )
    expect(senderWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [messageCreatedEvent],
        workspaceId: 'project-1'
      })
    )
    expect(senderWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [operationDoneEvent],
        workspaceId: 'project-1'
      })
    )
    expect(otherWorkspaceWebContents.send).not.toHaveBeenCalled()
  })

  it('keeps null-project session events scoped to the current client', async () => {
    const { createElectronEnvelopeIpcRpcServer } = await import(
      '@main/bootstrap/electron-envelope-ipc-rpc-server'
    )
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const operationEvent = createMessageCreatedEvent(null)
    const sender = { id: 2, send: vi.fn() }
    const otherWebContents = { id: 1, send: vi.fn() }
    const senderWebContents = { id: 2, send: vi.fn() }
    const rpcServer = createElectronEnvelopeIpcRpcServer()

    getAllWindowsMock.mockReturnValue([
      { webContents: otherWebContents },
      { webContents: senderWebContents }
    ])

    rpcServer.handle(RPC_CHANNELS.sessions.sendMessage, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent)

      return input
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.rpc.request)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(
      registeredHandler?.(
        { sender },
        createRequestEnvelope(RPC_CHANNELS.sessions.sendMessage, [{ content: 'hello' }])
      )
    ).resolves.toMatchObject({
      channel: RPC_CHANNELS.sessions.sendMessage,
      result: { content: 'hello' }
    })
    expect(sender.send).not.toHaveBeenCalled()
    expect(otherWebContents.send).not.toHaveBeenCalled()
    expect(senderWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [operationEvent],
        clientId: '2'
      })
    )
    expect(senderWebContents.send).toHaveBeenCalledTimes(1)
  })

  it('routes session events with route hints to workspace clients', async () => {
    const { createElectronEnvelopeIpcRpcServer } = await import(
      '@main/bootstrap/electron-envelope-ipc-rpc-server'
    )
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const { bindLegacyWebContentsClientWorkspace } = await import(
      '@main/bootstrap/legacy-webcontents-client-registry'
    )
    const operationEvent = createMessageDeltaEvent()
    const sender = { id: 502, send: vi.fn() }
    const sameWorkspaceWebContents = { id: 501, send: vi.fn() }
    const senderWebContents = { id: 502, send: vi.fn() }
    const otherWorkspaceWebContents = { id: 503, send: vi.fn() }
    const rpcServer = createElectronEnvelopeIpcRpcServer()

    getAllWindowsMock.mockReturnValue([
      { webContents: sameWorkspaceWebContents },
      { webContents: senderWebContents },
      { webContents: otherWorkspaceWebContents }
    ])
    bindLegacyWebContentsClientWorkspace(sameWorkspaceWebContents, 'project-1')
    bindLegacyWebContentsClientWorkspace(senderWebContents, 'project-1')
    bindLegacyWebContentsClientWorkspace(otherWorkspaceWebContents, 'project-2')

    rpcServer.handle(RPC_CHANNELS.sessions.runOperation, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent, {
        workspaceId: 'project-1'
      })

      return input
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.rpc.request)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(
      registeredHandler?.(
        { sender },
        createRequestEnvelope(RPC_CHANNELS.sessions.runOperation, [{ operationId: 'op-1' }])
      )
    ).resolves.toMatchObject({
      channel: RPC_CHANNELS.sessions.runOperation,
      result: { operationId: 'op-1' }
    })
    expect(sender.send).not.toHaveBeenCalled()
    expect(sameWorkspaceWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [operationEvent],
        workspaceId: 'project-1'
      })
    )
    expect(senderWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [operationEvent],
        workspaceId: 'project-1'
      })
    )
    expect(otherWorkspaceWebContents.send).not.toHaveBeenCalled()
  })

  it('keeps payloads without direct session scoped to the current client', async () => {
    const { createElectronEnvelopeIpcRpcServer } = await import(
      '@main/bootstrap/electron-envelope-ipc-rpc-server'
    )
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const operationEvent = createMessageDeltaEvent()
    const sender = { id: 402, send: vi.fn() }
    const otherWebContents = { id: 401, send: vi.fn() }
    const senderWebContents = { id: 402, send: vi.fn() }
    const rpcServer = createElectronEnvelopeIpcRpcServer()

    getAllWindowsMock.mockReturnValue([
      { webContents: otherWebContents },
      { webContents: senderWebContents }
    ])

    rpcServer.handle(RPC_CHANNELS.sessions.runOperation, (context, input) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent)

      return input
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.rpc.request)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(
      registeredHandler?.(
        { sender },
        createRequestEnvelope(RPC_CHANNELS.sessions.runOperation, [{ operationId: 'op-1' }])
      )
    ).resolves.toMatchObject({
      channel: RPC_CHANNELS.sessions.runOperation,
      result: { operationId: 'op-1' }
    })
    expect(sender.send).not.toHaveBeenCalled()
    expect(otherWebContents.send).not.toHaveBeenCalled()
    expect(senderWebContents.send).toHaveBeenCalledWith(
      ipcChannels.rpc.event,
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [operationEvent],
        clientId: '402'
      })
    )
    expect(senderWebContents.send).toHaveBeenCalledTimes(1)
  })

  it('returns HANDLER_ERROR response envelopes for ordinary handler errors', async () => {
    const { createElectronEnvelopeIpcRpcServer } = await import(
      '@main/bootstrap/electron-envelope-ipc-rpc-server'
    )
    const { ipcChannels } = await import('@ipc/channels')
    const { RPC_CHANNELS } = await import('@moon/shared/protocol')
    const rpcServer = createElectronEnvelopeIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.getMessages, () => {
      throw new Error('boom')
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.rpc.request)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(
      registeredHandler?.(
        { sender: { id: 1, send: vi.fn() } },
        createRequestEnvelope(RPC_CHANNELS.sessions.getMessages, [{ sessionId: 'session-1' }])
      )
    ).resolves.toMatchObject({
      channel: RPC_CHANNELS.sessions.getMessages,
      error: {
        code: 'HANDLER_ERROR',
        message: 'boom'
      }
    })
  })

  it('preserves CodedError codes in response envelopes', async () => {
    const { createElectronEnvelopeIpcRpcServer } = await import(
      '@main/bootstrap/electron-envelope-ipc-rpc-server'
    )
    const { ipcChannels } = await import('@ipc/channels')
    const { CodedError, RPC_CHANNELS } = await import('@moon/shared/protocol')
    const rpcServer = createElectronEnvelopeIpcRpcServer()

    rpcServer.handle(RPC_CHANNELS.sessions.cancelOperation, () => {
      throw new CodedError('REQUEST_TIMEOUT', 'too slow')
    })

    const registeredHandler = getRegisteredHandler(ipcChannels.rpc.request)

    expect(registeredHandler).toBeTypeOf('function')
    await expect(
      registeredHandler?.(
        { sender: { id: 1, send: vi.fn() } },
        createRequestEnvelope(RPC_CHANNELS.sessions.cancelOperation, [
          { operationId: 'operation-1' }
        ])
      )
    ).resolves.toMatchObject({
      channel: RPC_CHANNELS.sessions.cancelOperation,
      error: {
        code: 'REQUEST_TIMEOUT',
        message: 'too slow'
      }
    })
  })
})
