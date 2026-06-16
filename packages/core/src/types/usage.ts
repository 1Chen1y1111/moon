/**
 * 负责定义 agent 与会话层共享的 token/费用统计类型。
 * 它只描述归一化后的用量语义，不承载具体 provider 的原始 usage payload。
 */

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  totalTokens?: number
  costUsd?: number
  contextWindow?: number
}

export type AgentEventUsage = Partial<TokenUsage> & {
  inputTokens?: number
  outputTokens?: number
}
