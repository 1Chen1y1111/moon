import { streamText as streamGeneratedText } from 'ai'
import type { LanguageModel, ModelMessage, TextStreamPart, ToolSet } from 'ai'

import type { ChatJsonObject } from '../../shared/domain/chat'
import type { AgentRuntime, AgentRuntimeEvent, RunAgentInput } from './types'

export type StreamTextFunction = (input: {
  abortSignal?: AbortSignal
  model: LanguageModel
  messages: ModelMessage[]
}) => {
  fullStream?: AsyncIterable<TextStreamPart<ToolSet>>
  textStream?: AsyncIterable<string>
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toJsonObject(value: unknown): ChatJsonObject {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  ) {
    return value as ChatJsonObject
  }

  return { value }
}

export class LocalAgentRuntime implements AgentRuntime {
  private readonly streamText: StreamTextFunction

  constructor(streamText: StreamTextFunction = streamGeneratedText) {
    this.streamText = streamText
  }

  async *run(input: RunAgentInput): AsyncIterable<AgentRuntimeEvent> {
    const result = this.streamText(input)

    if (result.fullStream !== undefined) {
      yield* this.readFullStream(result.fullStream)
      return
    }

    if (result.textStream === undefined) {
      throw new Error('Agent runtime did not return a text stream.')
    }

    for await (const text of result.textStream) {
      if (text.length > 0) {
        yield { type: 'text-delta', text }
      }
    }

    yield { type: 'finish' }
  }

  private async *readFullStream(
    stream: AsyncIterable<TextStreamPart<ToolSet>>
  ): AsyncIterable<AgentRuntimeEvent> {
    for await (const part of stream) {
      if (part.type === 'text-delta' && part.text.length > 0) {
        yield { type: 'text-delta', text: part.text }
        continue
      }

      if (part.type === 'reasoning-delta' && part.text.length > 0) {
        yield { type: 'reasoning-delta', text: part.text }
        continue
      }

      if (part.type === 'tool-call') {
        yield {
          type: 'tool-call',
          tool: {
            id: part.toolCallId,
            name: part.toolName,
            input: toJsonObject(part.input),
            ...(part.title === undefined ? {} : { title: part.title })
          }
        }
        continue
      }

      if (part.type === 'tool-approval-request') {
        yield {
          type: 'tool-approval-request',
          approvalId: part.approvalId,
          tool: {
            id: part.toolCall.toolCallId,
            name: part.toolCall.toolName,
            input: toJsonObject(part.toolCall.input),
            ...(part.toolCall.title === undefined ? {} : { title: part.toolCall.title })
          }
        }
        continue
      }

      if (part.type === 'tool-result') {
        yield {
          type: 'tool-result',
          tool: {
            id: part.toolCallId,
            name: part.toolName,
            input: toJsonObject(part.input),
            output: toJsonObject(part.output),
            ...(part.title === undefined ? {} : { title: part.title })
          }
        }
        continue
      }

      if (part.type === 'tool-error') {
        yield {
          type: 'tool-error',
          tool: {
            id: part.toolCallId,
            name: part.toolName,
            input: toJsonObject(part.input),
            error: stringifyError(part.error),
            ...(part.title === undefined ? {} : { title: part.title })
          }
        }
        continue
      }

      if (part.type === 'abort') {
        yield { type: 'abort', ...(part.reason === undefined ? {} : { reason: part.reason }) }
        continue
      }

      if (part.type === 'error') {
        throw part.error
      }

      if (part.type === 'finish') {
        yield { type: 'finish' }
      }
    }
  }
}
