// @vitest-environment node

/**
 * 负责验证 @moon/server headless workspace WebSocket bootstrap。
 * 测试使用 fake WebSocket server 和 PGlite memory 数据库，不打开真实网络端口。
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { startMoonWorkspaceServer, type MoonWorkspaceServer } from '@moon/server'
import { serializeEnvelope } from '@moon/server-core/transport'
import { PROTOCOL_VERSION, RPC_CHANNELS } from '@moon/shared/protocol'

type FakeSocketEvent = 'message' | 'close' | 'error' | 'pong'
type FakeServerEvent = 'connection' | 'listening' | 'error'

class FakeSocket {
  readonly sent: string[] = []
  readyState = 1
  private readonly listeners = new Map<FakeSocketEvent, Array<(...args: unknown[]) => void>>()

  /**
   * 注册 fake socket 事件监听器。
   */
  on(event: FakeSocketEvent, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }

  /**
   * 记录 server 发给 client 的原始 JSON。
   */
  send(data: string): void {
    this.sent.push(data)
  }

  /**
   * 模拟 client 主动关闭连接。
   */
  close(): void {
    this.readyState = 3
    this.emit('close')
  }

  /**
   * 模拟 client 发送一条 WebSocket message。
   */
  emitMessage(data: string): void {
    this.emit('message', data)
  }

  private emit(event: FakeSocketEvent, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => {
      listener(...args)
    })
  }
}

class FakeSocketServer {
  readonly close = vi.fn((callback?: (error?: Error) => void) => {
    callback?.()
  })
  private readonly listeners = new Map<FakeServerEvent, Array<(...args: unknown[]) => void>>()

  /**
   * 返回已绑定的 fake TCP port。
   */
  address(): { port: number } {
    return { port: 48123 }
  }

  /**
   * 注册 fake server 事件监听器。
   */
  on(event: FakeServerEvent, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }

  /**
   * 模拟一个新 WebSocket client 连接。
   */
  connect(): FakeSocket {
    const socket = new FakeSocket()

    this.listeners.get('connection')?.forEach((listener) => {
      listener(socket)
    })

    return socket
  }
}

const migrationsFolder = join(process.cwd(), 'drizzle')

let workspaceServer: MoonWorkspaceServer | null = null
let attachmentsDirectory: string | null = null

/**
 * 等待 promise 微任务队列清空，确保异步 envelope dispatch 已完成。
 */
async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * 为 headless server 测试创建临时附件目录。
 */
async function createAttachmentsDirectory(): Promise<string> {
  attachmentsDirectory = await mkdtemp(join(tmpdir(), 'moon-server-attachments-'))
  return attachmentsDirectory
}

/**
 * 解析 fake socket 已收到的指定 envelope。
 */
function parseSentEnvelope(socket: FakeSocket, index: number): unknown {
  return JSON.parse(socket.sent[index])
}

/**
 * 等待 fake socket 收到指定序号的 envelope 后再解析。
 */
async function waitForSentEnvelope(socket: FakeSocket, index: number): Promise<unknown> {
  await vi.waitFor(() => {
    expect(socket.sent.length).toBeGreaterThan(index)
  })

  return parseSentEnvelope(socket, index)
}

/**
 * 完成 workspace WebSocket 协议握手。
 */
async function performHandshake(socket: FakeSocket): Promise<void> {
  socket.emitMessage(
    serializeEnvelope({
      id: 'handshake-1',
      type: 'handshake',
      protocolVersion: PROTOCOL_VERSION
    })
  )
  await flushPromises()
}

describe('startMoonWorkspaceServer', () => {
  afterEach(async () => {
    await workspaceServer?.close()
    workspaceServer = null

    if (attachmentsDirectory !== null) {
      await rm(attachmentsDirectory, { force: true, recursive: true })
      attachmentsDirectory = null
    }
  })

  it('starts a headless workspace endpoint and dispatches session requests', async () => {
    const fakeServer = new FakeSocketServer()

    workspaceServer = await startMoonWorkspaceServer({
      attachmentsDirectory: await createAttachmentsDirectory(),
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer,
      dataDir: 'memory://',
      migrationsFolder
    })

    expect(workspaceServer.url).toBe('ws://127.0.0.1:48123')

    const socket = fakeServer.connect()

    await performHandshake(socket)
    socket.emitMessage(
      serializeEnvelope({
        id: 'request-1',
        type: 'request',
        channel: RPC_CHANNELS.sessions.listSessions,
        args: []
      })
    )
    await flushPromises()

    expect(await waitForSentEnvelope(socket, 0)).toEqual({
      id: 'handshake-1',
      type: 'handshake_ack',
      clientId: 'client-1',
      protocolVersion: PROTOCOL_VERSION
    })
    expect(await waitForSentEnvelope(socket, 1)).toEqual({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.listSessions,
      result: []
    })
  })

  it('pushes session events through the headless workspace endpoint and closes resources', async () => {
    const fakeServer = new FakeSocketServer()
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    workspaceServer = await startMoonWorkspaceServer({
      attachmentsDirectory: await createAttachmentsDirectory(),
      createWebSocketServer: () => fakeServer,
      dataDir: 'memory://',
      migrationsFolder
    })

    const socket = fakeServer.connect()

    await performHandshake(socket)
    workspaceServer.workspaceRpcServer.push(RPC_CHANNELS.sessions.event, { to: 'all' }, event)
    await workspaceServer.close()

    expect(socket.sent.map((raw) => JSON.parse(raw))).toContainEqual(
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      })
    )
    expect(fakeServer.close).toHaveBeenCalledOnce()

    workspaceServer = null
  })
})
