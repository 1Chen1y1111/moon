/**
 * 定义 server 反向调用 client capability 的 transport-neutral contract。
 * 本文件只声明 client capability 的通道和 helper，不绑定 Electron 本地能力或 renderer API。
 */

/**
 * 安全测试能力：server 可请求 client 原样回显一个值，用于验证双向 RPC 链路。
 */
export const CLIENT_TEST_ECHO = 'client:testEcho' as const

/**
 * 安全外链能力：server 可请求已授权 client 打开一个 http/https URL。
 */
export const CLIENT_OPEN_EXTERNAL = 'client:openExternal' as const

/**
 * Moon 当前正式声明的 client capability channel。
 */
export type ClientCapabilityChannel = typeof CLIENT_TEST_ECHO | typeof CLIENT_OPEN_EXTERNAL

/**
 * client capability 的治理分类；test-only 不能被产品 preload 默认注册。
 */
export type ClientCapabilityAvailability = 'test-only' | 'product'

/**
 * client capability 的治理元信息，server 和 preload 都从这里读取能力边界。
 */
export type ClientCapabilityDefinition<TChannel extends ClientCapabilityChannel> = {
  channel: TChannel
  availability: ClientCapabilityAvailability
}

/**
 * capability channel 到请求参数和返回值的类型映射。
 */
export type ClientCapabilityRequestMap = {
  [CLIENT_TEST_ECHO]: {
    args: [value: unknown]
    result: unknown
  }
  [CLIENT_OPEN_EXTERNAL]: {
    args: [url: string]
    result: void
  }
}

/**
 * Moon 当前已登记的 client capability；新增能力必须先进入这里再被 host 注册。
 */
export const CLIENT_CAPABILITY_DEFINITIONS = {
  [CLIENT_TEST_ECHO]: {
    channel: CLIENT_TEST_ECHO,
    availability: 'test-only'
  },
  [CLIENT_OPEN_EXTERNAL]: {
    channel: CLIENT_OPEN_EXTERNAL,
    availability: 'product'
  }
} as const satisfies {
  [TChannel in ClientCapabilityChannel]: ClientCapabilityDefinition<TChannel>
}

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
 * 判断字符串是否是 registry 中登记过的 client capability channel。
 */
export function isClientCapabilityChannel(channel: string): channel is ClientCapabilityChannel {
  return Object.prototype.hasOwnProperty.call(CLIENT_CAPABILITY_DEFINITIONS, channel)
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
 * 按 registry 中的 capability channel 发起一次 typed server-to-client 调用。
 */
export async function requestClientCapability<TChannel extends ClientCapabilityChannel>(
  server: Pick<ClientCapabilityServer, 'invokeClient'>,
  clientId: string,
  channel: TChannel,
  ...args: ClientCapabilityRequestMap[TChannel]['args']
): Promise<ClientCapabilityRequestMap[TChannel]['result']> {
  return (await server.invokeClient(
    clientId,
    channel,
    ...args
  )) as ClientCapabilityRequestMap[TChannel]['result']
}

/**
 * 请求 client 执行安全 echo 能力；仅用于测试和链路 smoke，不代表产品能力。
 */
export async function requestClientTestEcho<TValue>(
  server: Pick<ClientCapabilityServer, 'invokeClient'>,
  clientId: string,
  value: TValue
): Promise<TValue> {
  return (await requestClientCapability(server, clientId, CLIENT_TEST_ECHO, value)) as TValue
}

/**
 * 请求 client 打开外部链接；实际 URL 安全校验由具体 client host 执行。
 */
export async function requestClientOpenExternal(
  server: Pick<ClientCapabilityServer, 'invokeClient'>,
  clientId: string,
  url: string
): Promise<void> {
  await requestClientCapability(server, clientId, CLIENT_OPEN_EXTERNAL, url)
}
