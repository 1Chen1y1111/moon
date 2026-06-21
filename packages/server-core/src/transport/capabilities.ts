/**
 * 定义 server 反向调用 client capability 的 transport-neutral contract。
 * 本文件只声明安全测试能力和 helper，不绑定 Electron 本地能力或 renderer API。
 */

/**
 * 安全测试能力：server 可请求 client 原样回显一个值，用于验证双向 RPC 链路。
 */
export const CLIENT_TEST_ECHO = 'client:testEcho' as const

/**
 * Moon 当前正式声明的 client capability channel。
 */
export type ClientCapabilityChannel = typeof CLIENT_TEST_ECHO

/**
 * capability helper 所需的最小 server 端口。
 */
export type ClientCapabilityServer = {
  /**
   * 查找当前在线且声明了指定 capability 的 client。
   */
  findClientsWithCapability: (
    capability: string,
    options?: { workspaceId?: string }
  ) => string[]

  /**
   * 通过 WebSocket 反向调用指定 client 的 capability。
   */
  invokeClient: (clientId: string, channel: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * 在指定 workspace 中查找第一个声明了目标 capability 的在线 client。
 */
export function findWorkspaceClientWithCapability(
  server: Pick<ClientCapabilityServer, 'findClientsWithCapability'>,
  capability: ClientCapabilityChannel,
  workspaceId: string
): string | null {
  const [clientId] = server.findClientsWithCapability(capability, { workspaceId })

  return clientId ?? null
}

/**
 * 请求 client 执行安全 echo 能力；仅用于测试和链路 smoke，不代表产品能力。
 */
export async function requestClientTestEcho<TValue>(
  server: Pick<ClientCapabilityServer, 'invokeClient'>,
  clientId: string,
  value: TValue
): Promise<TValue> {
  return (await server.invokeClient(clientId, CLIENT_TEST_ECHO, value)) as TValue
}
