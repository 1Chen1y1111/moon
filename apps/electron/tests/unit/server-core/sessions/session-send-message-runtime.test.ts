// @vitest-environment node

/**
 * 负责验证 SessionSendMessageRuntime 的 sendMessage 单调用编排。
 * 测试只覆盖 turn 创建、message-created 事件和 operation 启动顺序。
 */

import { describe, expect, it, vi } from 'vitest'

import type {
  ChatOperationEvent,
  CreateMessageTurnResult,
  RunChatOperationResult,
  SessionRecord
} from '@moon/shared/domain/chat'
import type { SendChatMessageInput } from '@moon/shared/domain/chat-validation'
import type { SessionEventRouteHint } from '@moon/server-core/sessions/handlers'
import {
  SessionSendMessageRuntime,
  type SessionSendMessageCreateTurn,
  type SessionSendMessageRunOperation
} from '@moon/server-core/sessions/session-send-message-runtime'

const timestamp = '2026-05-09T00:00:00.000Z'
const sendInput: SendChatMessageInput = { content: 'hello' }

type EventCall = [ChatOperationEvent, SessionEventRouteHint | undefined]
type TimelineEntry =
  | { event: ChatOperationEvent; routeHint?: SessionEventRouteHint; type: 'event' }
  | { input: { operationId: string }; type: 'run' }

function createTurn(session: Partial<SessionRecord> = {}): CreateMessageTurnResult {
  const sessionRecord: SessionRecord = {
    id: 'session-1',
    projectId: 'project-1',
    provider: 'claude',
    title: 'Moon',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...session
  }
  const topic = {
    id: 'topic-1',
    sessionId: sessionRecord.id,
    title: 'Moon',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const thread = {
    id: 'thread-1',
    topicId: topic.id,
    title: '主线',
    type: 'standalone' as const,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const operation = {
    id: 'operation-1',
    appContext: { sessionId: sessionRecord.id },
    provider: 'claude' as const,
    topicId: topic.id,
    threadId: thread.id,
    status: 'idle' as const,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const userMessage = {
    id: 'user-message-1',
    sessionId: sessionRecord.id,
    topicId: topic.id,
    threadId: thread.id,
    operationId: operation.id,
    role: 'user' as const,
    content: 'hello',
    status: 'complete' as const,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const assistantMessage = {
    ...userMessage,
    id: 'assistant-message-1',
    role: 'assistant' as const,
    content: '',
    status: 'pending' as const
  }

  return { session: sessionRecord, topic, thread, operation, userMessage, assistantMessage }
}

function createRunResult(): RunChatOperationResult {
  const turn = createTurn()

  return {
    operation: {
      ...turn.operation,
      status: 'done',
      completionReason: 'done'
    },
    messages: [
      turn.userMessage,
      {
        ...turn.assistantMessage,
        content: 'done',
        status: 'complete'
      }
    ]
  }
}

function createRuntimeFixture(input: {
  createTurnError?: Error
  runError?: Error
  turn?: CreateMessageTurnResult
} = {}): {
  createMessageTurn: ReturnType<typeof vi.fn<SessionSendMessageCreateTurn>>
  events: EventCall[]
  runOperation: ReturnType<typeof vi.fn<SessionSendMessageRunOperation>>
  runtime: SessionSendMessageRuntime
  timeline: TimelineEntry[]
} {
  const events: EventCall[] = []
  const timeline: TimelineEntry[] = []
  const createMessageTurn = vi.fn<SessionSendMessageCreateTurn>(async () => {
    if (input.createTurnError !== undefined) {
      throw input.createTurnError
    }

    return input.turn ?? createTurn()
  })
  const runOperation = vi.fn<SessionSendMessageRunOperation>(async (runInput) => {
    timeline.push({ type: 'run', input: runInput })

    if (input.runError !== undefined) {
      throw input.runError
    }

    return createRunResult()
  })
  const runtime = new SessionSendMessageRuntime({
    createMessageTurn,
    runOperation
  })

  return { createMessageTurn, events, runOperation, runtime, timeline }
}

function createEventListener(
  events: EventCall[],
  timeline: TimelineEntry[]
): (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void {
  return (event, routeHint) => {
    events.push([event, routeHint])
    timeline.push({ type: 'event', event, routeHint })
  }
}

function summarizeMessageCreatedEvents(
  events: EventCall[]
): Array<['message-created', string, SessionEventRouteHint | undefined]> {
  return events.map(([event, routeHint]) => {
    if (event.type !== 'message-created') {
      throw new Error(`Unexpected event type: ${event.type}`)
    }

    return [event.type, event.message.id, routeHint]
  })
}

describe('SessionSendMessageRuntime', () => {
  it('creates a turn, emits message-created events, then runs operation', async () => {
    const fixture = createRuntimeFixture()
    const onEvent = createEventListener(fixture.events, fixture.timeline)

    const result = await fixture.runtime.send({ input: sendInput, onEvent })

    expect(fixture.createMessageTurn).toHaveBeenCalledWith(sendInput)
    expect(fixture.runOperation).toHaveBeenCalledWith({ operationId: 'operation-1' }, onEvent)
    expect(fixture.timeline.map((entry) => entry.type)).toEqual(['event', 'event', 'run'])
    expect(summarizeMessageCreatedEvents(fixture.events)).toEqual([
      ['message-created', 'user-message-1', { workspaceId: 'project-1' }],
      ['message-created', 'assistant-message-1', { workspaceId: 'project-1' }]
    ])
    expect(result).toEqual({
      session: expect.objectContaining({ id: 'session-1' }),
      topic: expect.objectContaining({ id: 'topic-1' }),
      thread: expect.objectContaining({ id: 'thread-1' }),
      operation: expect.objectContaining({ status: 'done' }),
      messages: [
        expect.objectContaining({ role: 'user' }),
        expect.objectContaining({ role: 'assistant', content: 'done' })
      ]
    })
  })

  it('uses null workspace route hint for sessions without a project', async () => {
    const fixture = createRuntimeFixture({
      turn: createTurn({ projectId: null })
    })
    const onEvent = createEventListener(fixture.events, fixture.timeline)

    await fixture.runtime.send({ input: sendInput, onEvent })

    expect(fixture.events.map(([, routeHint]) => routeHint)).toEqual([
      { workspaceId: null },
      { workspaceId: null }
    ])
  })

  it('does not run operation when turn creation fails', async () => {
    const fixture = createRuntimeFixture({
      createTurnError: new Error('turn failed')
    })

    await expect(fixture.runtime.send({ input: sendInput })).rejects.toThrow('turn failed')
    expect(fixture.runOperation).not.toHaveBeenCalled()
  })

  it('keeps emitted message-created events when operation execution fails', async () => {
    const fixture = createRuntimeFixture({
      runError: new Error('run failed')
    })
    const onEvent = createEventListener(fixture.events, fixture.timeline)

    await expect(fixture.runtime.send({ input: sendInput, onEvent })).rejects.toThrow(
      'run failed'
    )
    expect(fixture.events.map(([event]) => event.type)).toEqual([
      'message-created',
      'message-created'
    ])
    expect(fixture.timeline.map((entry) => entry.type)).toEqual(['event', 'event', 'run'])
  })
})
