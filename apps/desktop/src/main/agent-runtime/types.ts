import type { LanguageModel, ModelMessage } from 'ai'

import type { ChatJsonObject } from '@moon/shared/domain/chat'

export type AgentRuntimeToolEvent = {
  id: string
  name: string
  input: ChatJsonObject
  title?: string
}

export type AgentRuntimeToolResultEvent = AgentRuntimeToolEvent & {
  output?: ChatJsonObject
  error?: string
}

export type AgentRuntimeEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; tool: AgentRuntimeToolEvent }
  | { type: 'tool-approval-request'; approvalId: string; tool: AgentRuntimeToolEvent }
  | { type: 'tool-result'; tool: AgentRuntimeToolResultEvent }
  | { type: 'tool-error'; tool: AgentRuntimeToolResultEvent }
  | { type: 'abort'; reason?: string }
  | { type: 'finish' }

export type RunAgentInput = {
  model: LanguageModel
  messages: ModelMessage[]
  abortSignal?: AbortSignal
}

export interface AgentRuntime {
  run(input: RunAgentInput): AsyncIterable<AgentRuntimeEvent>
}
