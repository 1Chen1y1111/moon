// @vitest-environment node

/**
 * 负责验证 headless workspace server 与 server-core WebSocket client 的真实远程链路。
 * 测试打开本机随机端口，不依赖 Electron、renderer 或外部服务。
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

import { startMoonWorkspaceServer, type MoonWorkspaceServer } from '@moon/server'
import {
  createWorkspaceWebSocketRpcClient,
  type WorkspaceWebSocketConstructor,
  type WorkspaceWebSocketEvent
} from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'

type NodeWebSocketEventName = 'open' | 'message' | 'close' | 'error'
type NodeWebSocketListener = (event: WorkspaceWebSocketEvent) => void

class NodeWebSocketAdapter {
  private readonly listeners = new Map<
    NodeWebSocketEventName,
    Array<{
      handler: (...args: unknown[]) => void
      listener: NodeWebSocketListener
    }>
  >()
  private readonly socket: WebSocket

  /**
   * 创建 Node `ws` client，并把它适配成 server-core 需要的最小 WebSocket 形状。
   */
  constructor(url: string) {
    this.socket = new WebSocket(url)
  }

  /**
   * 暴露底层 WebSocket readyState，供 server-core 判断连接是否可复用。
   */
  get readyState(): number {
    return this.socket.readyState
  }

  /**
   * 注册 DOM-like WebSocket 事件监听器。
   */
  addEventListener(event: NodeWebSocketEventName, listener: NodeWebSocketListener): void {
    const handler =
      event === 'message'
        ? (data: unknown) => {
            listener({ data: Buffer.isBuffer(data) ? data.toString('utf8') : String(data) })
          }
        : () => {
            listener({})
          }

    this.listeners.set(event, [...(this.listeners.get(event) ?? []), { handler, listener }])
    this.socket.on(event, handler)
  }

  /**
   * 移除 DOM-like WebSocket 事件监听器。
   */
  removeEventListener(event: NodeWebSocketEventName, listener: NodeWebSocketListener): void {
    const nextListeners: Array<{
      handler: (...args: unknown[]) => void
      listener: NodeWebSocketListener
    }> = []

    for (const entry of this.listeners.get(event) ?? []) {
      if (entry.listener === listener) {
        this.socket.off(event, entry.handler)
        continue
      }

      nextListeners.push(entry)
    }

    this.listeners.set(event, nextListeners)
  }

  /**
   * 发送 envelope JSON 字符串。
   */
  send(data: string): void {
    this.socket.send(data)
  }

  /**
   * 关闭底层 WebSocket 连接。
   */
  close(): void {
    this.socket.close()
  }
}

const migrationsFolder = join(process.cwd(), 'drizzle')
const pgliteTestTimeout = 30_000

let workspaceServer: MoonWorkspaceServer | null = null
let tempDirectory: string | null = null

/**
 * 创建本次 smoke 测试独占的临时目录。
 */
async function createTempDirectory(): Promise<string> {
  tempDirectory = await mkdtemp(join(tmpdir(), 'moon-remote-smoke-'))
  return tempDirectory
}

describe('workspace remote smoke', () => {
  afterEach(async () => {
    await workspaceServer?.close()
    workspaceServer = null

    if (tempDirectory !== null) {
      await rm(tempDirectory, { force: true, recursive: true })
      tempDirectory = null
    }
  })

  it(
    'dispatches session requests and pushes session events over a real WebSocket',
    async () => {
      const directory = await createTempDirectory()

      workspaceServer = await startMoonWorkspaceServer({
        attachmentsDirectory: join(directory, 'attachments'),
        dataDir: 'memory://',
        migrationsFolder
      })

      const client = createWorkspaceWebSocketRpcClient({
        createId: () => 'request-1',
        getTransportUrl: async () => workspaceServer?.url ?? '',
        WebSocketCtor: NodeWebSocketAdapter as WorkspaceWebSocketConstructor
      })
      const listener = vi.fn()
      const event = {
        type: 'message-delta',
        operationId: 'operation-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        messageId: 'message-1',
        delta: 'hello from headless'
      } as const

      client.on(RPC_CHANNELS.sessions.event, listener)

      await expect(client.invoke(RPC_CHANNELS.sessions.listSessions)).resolves.toEqual([])

      workspaceServer.workspaceRpcServer.push(RPC_CHANNELS.sessions.event, { to: 'all' }, event)

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith(event)
      })
    },
    pgliteTestTimeout
  )
})
