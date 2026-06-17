/**
 * 负责定义 LLM connection 的共享模型和校验规则。
 * 它只描述连接配置的可传输形状，不负责密钥加密、持久化或 SDK 初始化。
 */

import { z } from 'zod'

export const agentBackendProviders = ['anthropic', 'pi', 'pi_compat'] as const

export type AgentBackendProvider = (typeof agentBackendProviders)[number]

export const thinkingLevels = ['low', 'medium', 'high'] as const

export type ThinkingLevel = (typeof thinkingLevels)[number]

export const agentBackendProviderSchema = z.enum(agentBackendProviders)

export const thinkingLevelSchema = z.enum(thinkingLevels)

export const customEndpointApis = ['anthropic-messages', 'openai-completions'] as const

export type CustomEndpointApi = (typeof customEndpointApis)[number]

export const customEndpointApiSchema = z.enum(customEndpointApis)

export const customEndpointSchema = z.object({
  api: customEndpointApiSchema
})

/**
 * 判断 API key 是否能安全放入 HTTP header；空值表示沿用已存凭据或未配置。
 */
export function isValidApiKeyValue(value: string): boolean {
  return value.length === 0 || /^[\x21-\x7e]+$/u.test(value)
}

const apiKeySchema = z
  .string()
  .trim()
  .refine(isValidApiKeyValue, 'API key must not contain spaces or non-ASCII characters.')

export const llmConnectionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  providerId: z.string().trim().min(1).optional(),
  backend: agentBackendProviderSchema,
  model: z.string().trim().min(1),
  apiKey: apiKeySchema.optional(),
  baseUrl: z.string().trim().url().optional(),
  customEndpoint: customEndpointSchema.optional(),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  thinkingLevel: thinkingLevelSchema.default('medium')
})

export type LlmConnection = z.input<typeof llmConnectionSchema>

export type NormalizedLlmConnection = z.output<typeof llmConnectionSchema>

/**
 * 创建指定 backend 的默认连接配置，用于设置页初始化和测试夹具。
 */
export function createDefaultLlmConnection(backend: AgentBackendProvider): NormalizedLlmConnection {
  return llmConnectionSchema.parse({
    id: backend,
    name: backend === 'anthropic' ? 'Claude SDK' : 'Pi Backend',
    backend,
    model: backend === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-5',
    enabled: true,
    isDefault: backend === 'anthropic',
    thinkingLevel: 'medium'
  })
}

/**
 * 从连接列表中选择默认可用连接，调用方负责决定空结果时的用户提示。
 */
export function selectDefaultLlmConnection(
  connections: LlmConnection[]
): NormalizedLlmConnection | null {
  const normalizedConnections = connections.map((connection) =>
    llmConnectionSchema.parse(connection)
  )

  return (
    normalizedConnections.find((connection) => connection.enabled && connection.isDefault) ??
    normalizedConnections.find((connection) => connection.enabled) ??
    null
  )
}
