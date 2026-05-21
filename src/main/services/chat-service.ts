import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { FilePart, ImagePart, LanguageModel, ModelMessage, TextPart } from 'ai'

import { LocalAgentRuntime, type StreamTextFunction } from '../agent-runtime/local-agent-runtime'
import type { AgentRuntime, AgentRuntimeEvent } from '../agent-runtime/types'
import type { AgentOperationsRepository } from '../repositories/agent-operations-repository'
import type { MessagesRepository } from '../repositories/messages-repository'
import type { SessionsRepository } from '../repositories/sessions-repository'
import type { ThreadsRepository } from '../repositories/threads-repository'
import type { ToolInvocationsRepository } from '../repositories/tool-invocations-repository'
import type { TopicsRepository } from '../repositories/topics-repository'
import type {
  AgentOperationRecord,
  ChatAttachmentKind,
  ChatAttachmentRecord,
  ChatOperationEvent,
  CreateMessageTurnResult,
  MessageRecord,
  RunChatOperationResult,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '../../shared/domain/chat'
import { defaultChatUserId } from '../../shared/domain/chat'
import {
  approveToolCallInputSchema,
  cancelAgentOperationInputSchema,
  createMessageTurnInputSchema,
  getChatMessagesInputSchema,
  importChatAttachmentInputSchema,
  deleteChatSessionInputSchema,
  listChatThreadsInputSchema,
  listChatTopicsInputSchema,
  rejectToolCallInputSchema,
  runChatOperationInputSchema,
  sendChatMessageInputSchema,
  type ApproveToolCallInput,
  type CancelAgentOperationInput,
  type CreateMessageTurnInput,
  type DeleteChatSessionInput,
  type GetChatMessagesInput,
  type ImportChatAttachmentInput,
  type ListChatThreadsInput,
  type ListChatTopicsInput,
  type RejectToolCallInput,
  type RunChatOperationInput,
  type SendChatMessageInput
} from '../../shared/domain/chat-validation'
import {
  isOpenAICompatibleProvider,
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider
} from '../../shared/domain/chat-provider'
import type { ProviderSettings } from '../../shared/domain/settings'
import type { SettingsRepository } from '../repositories/settings-repository'

const newChatTitle = '新聊天'
const defaultTopicTitle = '默认话题'
const defaultThreadTitle = '主线'
const titleMaxLength = 48

type ChatServiceDependencies = {
  agentOperationsRepository: AgentOperationsRepository
  agentRuntime?: AgentRuntime
  attachmentsDirectory?: string
  messagesRepository: MessagesRepository
  sessionsRepository: SessionsRepository
  settingsRepository: SettingsRepository
  streamText?: StreamTextFunction
  threadsRepository: ThreadsRepository
  toolInvocationsRepository: ToolInvocationsRepository
  topicsRepository: TopicsRepository
}

type ChatOperationEventListener = (event: ChatOperationEvent) => void

type ResolvedProvider = {
  provider: ProviderSettings
  session: SessionRecord | null
}

type ConversationScope = {
  session: SessionRecord
  topic: TopicRecord
  thread: ThreadRecord
}

type AiProviderOptions = {
  baseURL?: string
  apiKey?: string
  headers?: Record<string, string>
}

function createTimestamp(): string {
  return new Date().toISOString()
}

function resolveAttachmentKind(mimeType: string): ChatAttachmentKind {
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

function toBuffer(data: ArrayBuffer | ArrayBufferView): Buffer {
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }

  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

function isTextAttachment(attachment: ChatAttachmentRecord): boolean {
  if (attachment.mimeType.startsWith('text/') || attachment.mimeType === 'application/json') {
    return true
  }

  const extension = attachment.name.split('.').at(-1)?.toLowerCase()

  return (
    extension !== undefined &&
    [
      'txt',
      'md',
      'markdown',
      'json',
      'csv',
      'log',
      'ts',
      'tsx',
      'js',
      'jsx',
      'css',
      'html',
      'xml',
      'yml',
      'yaml'
    ].includes(extension)
  )
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveProviderBaseUrl(provider: ProviderSettings): string {
  return (provider.baseUrl.trim() || provider.defaultBaseUrl.trim()).trim()
}

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl)

  return normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`
}

function parseCustomHeaders(value: string): Record<string, string> {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return {}
  }

  const parsed = JSON.parse(trimmedValue) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(parsed).map(([key, headerValue]) => [key, String(headerValue)])
  )
}

function createAiProviderOptions(provider: ProviderSettings): AiProviderOptions {
  const baseURL = resolveProviderBaseUrl(provider)
  const apiKey = provider.apiKey.trim()
  const headers = parseCustomHeaders(provider.customHeaders)

  if (!provider.noApiKey && apiKey.length === 0) {
    throw new Error(`${provider.name} API key is required.`)
  }

  return {
    ...(baseURL.length === 0 ? {} : { baseURL }),
    ...(provider.noApiKey || apiKey.length === 0 ? {} : { apiKey }),
    ...(Object.keys(headers).length === 0 ? {} : { headers })
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function normalizeToolResult(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return { value }
}

export {
  isOpenAICompatibleProvider,
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider
}

export function createChatLanguageModel(
  provider: ProviderSettings,
  modelId: string
): LanguageModel {
  const options = createAiProviderOptions(provider)

  if (provider.apiFormat === 'anthropic' || provider.type === 'anthropic') {
    const baseURL =
      options.baseURL === undefined ? undefined : normalizeAnthropicBaseUrl(options.baseURL)

    return createAnthropic({
      ...options,
      ...(baseURL === undefined ? {} : { baseURL })
    }).chat(modelId)
  }

  if (provider.type === 'google') {
    return createGoogleGenerativeAI(options).chat(modelId)
  }

  if (provider.type === 'openai' || provider.apiFormat === 'openai-responses') {
    const openaiProvider = createOpenAI(options)

    return provider.apiFormat === 'openai-responses'
      ? openaiProvider.responses(modelId)
      : openaiProvider.chat(modelId)
  }

  if (provider.apiFormat === 'openai-chat' && isOpenAICompatibleProvider(provider)) {
    if (options.baseURL === undefined) {
      throw new Error(`${provider.name} base URL is required.`)
    }

    return createOpenAICompatible({
      name: provider.provider,
      baseURL: options.baseURL,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.headers === undefined ? {} : { headers: options.headers })
    }).chatModel(modelId)
  }

  throw new Error(`${provider.name} is not supported for chat.`)
}

export function createChatTitle(content: string): string {
  const normalizedContent = content.replace(/\s+/g, ' ').trim()

  if (normalizedContent.length <= titleMaxLength) {
    return normalizedContent || newChatTitle
  }

  return `${normalizedContent.slice(0, titleMaxLength)}...`
}

async function toModelMessage(
  message: MessageRecord,
  attachmentsDirectory: string
): Promise<ModelMessage | null> {
  if (message.status === 'error' || message.status === 'cancelled') {
    return null
  }

  if (message.role === 'user') {
    if ((message.attachments?.length ?? 0) > 0) {
      const content: Array<TextPart | ImagePart | FilePart> =
        message.content.trim().length === 0 ? [] : [{ type: 'text', text: message.content }]

      for (const attachment of message.attachments ?? []) {
        const data = await readFile(join(attachmentsDirectory, attachment.id))

        if (attachment.kind === 'image') {
          content.push({
            type: 'image',
            image: data,
            mediaType: attachment.mimeType
          })
        } else if (isTextAttachment(attachment)) {
          content.push({
            type: 'text',
            text: `\n\n[Attachment: ${attachment.name}]\n${data.toString('utf8')}`
          })
        } else {
          content.push({
            type: 'file',
            data,
            filename: attachment.name,
            mediaType: attachment.mimeType
          })
        }
      }

      return { role: 'user', content }
    }

    return { role: 'user', content: message.content }
  }

  if (message.role === 'assistant' && message.content.trim().length > 0) {
    return { role: 'assistant', content: message.content }
  }

  if (message.role === 'system') {
    return { role: 'system', content: message.content }
  }

  return null
}

export class ChatService {
  private readonly activeOperations = new Map<string, AbortController>()
  private readonly agentOperationsRepository: AgentOperationsRepository
  private readonly agentRuntime: AgentRuntime
  private readonly attachmentsDirectory: string
  private readonly messagesRepository: MessagesRepository
  private readonly sessionsRepository: SessionsRepository
  private readonly settingsRepository: SettingsRepository
  private readonly threadsRepository: ThreadsRepository
  private readonly toolInvocationsRepository: ToolInvocationsRepository
  private readonly topicsRepository: TopicsRepository

  constructor({
    agentOperationsRepository,
    agentRuntime,
    attachmentsDirectory,
    messagesRepository,
    sessionsRepository,
    settingsRepository,
    streamText,
    threadsRepository,
    toolInvocationsRepository,
    topicsRepository
  }: ChatServiceDependencies) {
    this.agentOperationsRepository = agentOperationsRepository
    this.agentRuntime = agentRuntime ?? new LocalAgentRuntime(streamText)
    this.attachmentsDirectory = attachmentsDirectory ?? join(process.cwd(), '.moon-attachments')
    this.messagesRepository = messagesRepository
    this.sessionsRepository = sessionsRepository
    this.settingsRepository = settingsRepository
    this.threadsRepository = threadsRepository
    this.toolInvocationsRepository = toolInvocationsRepository
    this.topicsRepository = topicsRepository
  }

  listSessions(): Promise<SessionRecord[]> {
    return this.sessionsRepository.list()
  }

  async listTopics(input: ListChatTopicsInput): Promise<TopicRecord[]> {
    const parsedInput = listChatTopicsInputSchema.parse(input)

    return this.topicsRepository.listBySession(parsedInput.sessionId)
  }

  async listThreads(input: ListChatThreadsInput): Promise<ThreadRecord[]> {
    const parsedInput = listChatThreadsInputSchema.parse(input)

    return this.threadsRepository.listByTopic(parsedInput.topicId)
  }

  async getMessages(input: GetChatMessagesInput): Promise<MessageRecord[]> {
    const parsedInput = getChatMessagesInputSchema.parse(input)

    if (parsedInput.threadId !== undefined) {
      return this.messagesRepository.listByThread(parsedInput.threadId)
    }

    const thread = await this.getDefaultThread(parsedInput.sessionId)

    return thread === null ? [] : this.messagesRepository.listByThread(thread.id)
  }

  async createSession(): Promise<SessionRecord> {
    const settings = await this.settingsRepository.getSettings()
    const provider = await this.withStoredApiKey(selectDefaultChatProvider(settings))
    const model = selectChatModel(provider)

    createChatLanguageModel(provider, model)

    const scope = await this.createConversationScope(provider, newChatTitle)

    return scope.session
  }

  async deleteSession(input: DeleteChatSessionInput): Promise<void> {
    const parsedInput = deleteChatSessionInputSchema.parse(input)

    await this.sessionsRepository.deleteById(parsedInput.sessionId)
  }

  async importAttachment(input: ImportChatAttachmentInput): Promise<ChatAttachmentRecord> {
    const parsedInput = importChatAttachmentInputSchema.parse(input)
    const id = randomUUID()
    const createdAt = createTimestamp()

    await mkdir(this.attachmentsDirectory, { recursive: true })
    await writeFile(join(this.attachmentsDirectory, id), toBuffer(parsedInput.data))

    return {
      id,
      name: parsedInput.name,
      mimeType: parsedInput.mimeType,
      size: parsedInput.size,
      kind: resolveAttachmentKind(parsedInput.mimeType),
      createdAt
    }
  }

  async createMessageTurn(input: CreateMessageTurnInput): Promise<CreateMessageTurnResult> {
    const parsedInput = createMessageTurnInputSchema.parse(input)
    const resolvedProvider = await this.resolveProvider(parsedInput)
    const provider = await this.withStoredApiKey(resolvedProvider.provider)
    const modelId = selectChatModel(provider)

    createChatLanguageModel(provider, modelId)

    const scope = await this.resolveConversationScope(
      parsedInput,
      resolvedProvider.session,
      provider
    )
    const operation = await this.createOperation(scope, provider, modelId, 'idle')
    const attachments = parsedInput.attachments ?? []
    const timestamp = createTimestamp()
    const previousMessages = await this.messagesRepository.listByThread(scope.thread.id)
    const parentMessage = [...previousMessages].reverse().find((message) => message.role !== 'tool')
    const userMessage = await this.messagesRepository.save({
      id: randomUUID(),
      sessionId: scope.session.id,
      topicId: scope.topic.id,
      threadId: scope.thread.id,
      ...(parentMessage === undefined ? {} : { parentId: parentMessage.id }),
      operationId: operation.id,
      role: 'user',
      content: parsedInput.content,
      status: 'complete',
      provider: provider.provider,
      model: modelId,
      ...(attachments.length === 0 ? {} : { attachments }),
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const title = createChatTitle(parsedInput.content || attachments[0]?.name || '')
    const sessionAfterUser = await this.touchSessionWithTitle(scope.session, title)
    const topicAfterUser = await this.touchTopicTitle(scope.topic, title)
    const threadAfterUser = await this.touchThreadTitle(scope.thread, title)
    const assistantTimestamp = createTimestamp()
    const assistantMessage = await this.messagesRepository.save({
      id: randomUUID(),
      sessionId: sessionAfterUser.id,
      topicId: topicAfterUser.id,
      threadId: threadAfterUser.id,
      parentId: userMessage.id,
      operationId: operation.id,
      role: 'assistant',
      content: '',
      reasoning: '',
      status: 'pending',
      provider: provider.provider,
      model: modelId,
      createdAt: assistantTimestamp,
      updatedAt: assistantTimestamp
    })

    return {
      session: sessionAfterUser,
      topic: topicAfterUser,
      thread: threadAfterUser,
      operation,
      userMessage,
      assistantMessage
    }
  }

  async runOperation(
    input: RunChatOperationInput,
    onEvent?: ChatOperationEventListener
  ): Promise<RunChatOperationResult> {
    const parsedInput = runChatOperationInputSchema.parse(input)
    const operation = await this.agentOperationsRepository.findById(parsedInput.operationId)

    if (operation === null) {
      throw new Error('Agent operation not found.')
    }

    const scope = await this.resolveOperationScope(operation)
    const provider = await this.resolveOperationProvider(operation, scope.session)
    const modelId = operation.model ?? selectChatModel(provider)
    const languageModel = createChatLanguageModel(provider, modelId)
    const operationMessages = await this.messagesRepository.listByOperation(operation.id)
    const userMessage = operationMessages.find((message) => message.role === 'user')
    const assistantMessage = operationMessages.find((message) => message.role === 'assistant')

    if (userMessage === undefined || assistantMessage === undefined) {
      throw new Error('Agent operation messages not found.')
    }

    const startedAt = createTimestamp()
    const runningOperation = await this.agentOperationsRepository.save({
      ...operation,
      status: 'running',
      completionReason: null,
      error: null,
      startedAt: operation.startedAt ?? startedAt,
      updatedAt: startedAt
    })
    const streamingAssistantMessage = await this.messagesRepository.save({
      ...assistantMessage,
      status: 'streaming',
      error: null,
      updatedAt: startedAt
    })
    const abortController = new AbortController()

    onEvent?.({
      type: 'operation-started',
      operationId: runningOperation.id,
      operation: runningOperation
    })

    this.activeOperations.set(runningOperation.id, abortController)

    try {
      const result = await this.executeOperation({
        abortController,
        assistantMessage: streamingAssistantMessage,
        languageModel,
        onEvent,
        operation: runningOperation,
        scope
      })

      return {
        operation: result.operation,
        messages: result.messages
      }
    } finally {
      this.activeOperations.delete(runningOperation.id)
    }
  }

  async sendMessage(
    input: SendChatMessageInput,
    onEvent?: ChatOperationEventListener
  ): Promise<SendMessageResult> {
    const parsedInput = sendChatMessageInputSchema.parse(input)
    const turn = await this.createMessageTurn(parsedInput)

    onEvent?.({
      type: 'message-created',
      operationId: turn.operation.id,
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      message: turn.userMessage
    })
    onEvent?.({
      type: 'message-created',
      operationId: turn.operation.id,
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      message: turn.assistantMessage
    })

    const runResult = await this.runOperation({ operationId: turn.operation.id }, onEvent)

    return {
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      operation: runResult.operation,
      messages: runResult.messages
    }
  }

  async cancelOperation(input: CancelAgentOperationInput): Promise<AgentOperationRecord> {
    const parsedInput = cancelAgentOperationInputSchema.parse(input)
    const abortController = this.activeOperations.get(parsedInput.operationId)
    const timestamp = createTimestamp()

    abortController?.abort('cancelled')

    const operation = await this.agentOperationsRepository.findById(parsedInput.operationId)

    if (operation === null) {
      throw new Error('Agent operation not found.')
    }

    const cancelledOperation = await this.agentOperationsRepository.save({
      ...operation,
      status: 'interrupted',
      completionReason: 'interrupted',
      error: null,
      updatedAt: timestamp,
      completedAt: timestamp
    })

    const operationMessages = await this.messagesRepository.listByOperation(operation.id)
    const assistantMessage = operationMessages.find((message) => message.role === 'assistant')

    if (assistantMessage !== undefined) {
      await this.messagesRepository.save({
        ...assistantMessage,
        status: 'cancelled',
        error: 'Cancelled by user.',
        updatedAt: timestamp
      })
    }

    return cancelledOperation
  }

  async approveToolCall(input: ApproveToolCallInput): Promise<ToolInvocationRecord> {
    const parsedInput = approveToolCallInputSchema.parse(input)
    const toolInvocation = await this.toolInvocationsRepository.findById(
      parsedInput.toolInvocationId
    )

    if (toolInvocation === null) {
      throw new Error('Tool invocation not found.')
    }

    return this.toolInvocationsRepository.save({
      ...toolInvocation,
      status: 'done',
      result: { approved: true },
      error: null,
      updatedAt: createTimestamp()
    })
  }

  async rejectToolCall(input: RejectToolCallInput): Promise<ToolInvocationRecord> {
    const parsedInput = rejectToolCallInputSchema.parse(input)
    const toolInvocation = await this.toolInvocationsRepository.findById(
      parsedInput.toolInvocationId
    )

    if (toolInvocation === null) {
      throw new Error('Tool invocation not found.')
    }

    return this.toolInvocationsRepository.save({
      ...toolInvocation,
      status: 'rejected',
      result: null,
      error: parsedInput.reason ?? 'Rejected by user.',
      updatedAt: createTimestamp()
    })
  }

  private async executeOperation({
    abortController,
    assistantMessage: initialAssistantMessage,
    languageModel,
    onEvent,
    operation,
    scope
  }: {
    abortController: AbortController
    assistantMessage: MessageRecord
    languageModel: LanguageModel
    onEvent?: ChatOperationEventListener
    operation: AgentOperationRecord
    scope: ConversationScope
  }): Promise<SendMessageResult> {
    const eventScope = {
      session: scope.session,
      topic: scope.topic,
      thread: scope.thread
    }
    let assistantMessage = initialAssistantMessage
    const previousMessages = await this.messagesRepository.listByThread(scope.thread.id)

    const modelMessages = (
      await Promise.all(
        previousMessages
          .filter((message) => message.id !== assistantMessage.id)
          .map((message) => toModelMessage(message, this.attachmentsDirectory))
      )
    ).filter((message): message is ModelMessage => message !== null)

    try {
      for await (const runtimeEvent of this.agentRuntime.run({
        model: languageModel,
        messages: modelMessages,
        abortSignal: abortController.signal
      })) {
        assistantMessage = await this.applyRuntimeEvent({
          event: runtimeEvent,
          message: assistantMessage,
          onEvent,
          operation,
          scope: eventScope
        })
      }

      const completedTimestamp = createTimestamp()

      if (assistantMessage.content.trim().length === 0 && !assistantMessage.reasoning) {
        throw new Error('Model returned an empty response.')
      }

      assistantMessage = await this.messagesRepository.save({
        ...assistantMessage,
        content: assistantMessage.content.trim(),
        status: 'complete',
        updatedAt: completedTimestamp
      })

      const completedOperation = await this.agentOperationsRepository.save({
        ...operation,
        status: 'done',
        completionReason: 'done',
        updatedAt: completedTimestamp,
        completedAt: completedTimestamp
      })
      const sessionAfterAssistant = await this.sessionsRepository.save({
        ...eventScope.session,
        updatedAt: completedTimestamp
      })
      const messages = await this.messagesRepository.listByThread(eventScope.thread.id)

      onEvent?.({
        type: 'operation-done',
        operationId: operation.id,
        session: sessionAfterAssistant,
        topic: eventScope.topic,
        thread: eventScope.thread,
        operation: completedOperation,
        messages
      })

      return {
        session: sessionAfterAssistant,
        topic: eventScope.topic,
        thread: eventScope.thread,
        operation: completedOperation,
        messages
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      const failedTimestamp = createTimestamp()
      const isCancelled = abortController.signal.aborted
      const failedOperation = await this.agentOperationsRepository.save({
        ...operation,
        status: isCancelled ? 'interrupted' : 'error',
        completionReason: isCancelled ? 'interrupted' : 'error',
        error: isCancelled ? null : { message: errorMessage },
        updatedAt: failedTimestamp,
        completedAt: failedTimestamp
      })

      await this.messagesRepository.save({
        ...assistantMessage,
        status: isCancelled ? 'cancelled' : 'error',
        error: isCancelled ? 'Cancelled by user.' : errorMessage,
        updatedAt: failedTimestamp
      })

      onEvent?.({
        type: 'operation-error',
        operationId: operation.id,
        sessionId: eventScope.session.id,
        topicId: eventScope.topic.id,
        threadId: eventScope.thread.id,
        messageId: assistantMessage.id,
        error: isCancelled ? 'Cancelled by user.' : errorMessage,
        operation: failedOperation
      })

      throw error
    }
  }

  private async applyRuntimeEvent({
    event,
    message,
    onEvent,
    operation,
    scope
  }: {
    event: AgentRuntimeEvent
    message: MessageRecord
    onEvent?: ChatOperationEventListener
    operation: AgentOperationRecord
    scope: ConversationScope
  }): Promise<MessageRecord> {
    if (event.type === 'text-delta') {
      const updatedMessage = await this.messagesRepository.save({
        ...message,
        content: `${message.content}${event.text}`,
        updatedAt: createTimestamp()
      })

      onEvent?.({
        type: 'message-delta',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        delta: event.text
      })

      return updatedMessage
    }

    if (event.type === 'reasoning-delta') {
      const updatedMessage = await this.messagesRepository.save({
        ...message,
        reasoning: `${message.reasoning ?? ''}${event.text}`,
        updatedAt: createTimestamp()
      })

      onEvent?.({
        type: 'reasoning-delta',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        delta: event.text
      })

      return updatedMessage
    }

    if (event.type === 'tool-call' || event.type === 'tool-approval-request') {
      const status = event.type === 'tool-approval-request' ? 'waiting_for_human' : 'running'
      const timestamp = createTimestamp()
      const toolInvocation = await this.toolInvocationsRepository.save({
        id: event.tool.id,
        toolCallId: event.tool.id,
        operationId: operation.id,
        messageId: message.id,
        name: event.tool.name,
        arguments: event.tool.input,
        status,
        createdAt: timestamp,
        updatedAt: timestamp
      })

      if (status === 'waiting_for_human') {
        await this.agentOperationsRepository.save({
          ...operation,
          status: 'waiting_for_human',
          completionReason: 'waiting_for_human',
          humanInterventions: (operation.humanInterventions ?? 0) + 1,
          updatedAt: timestamp
        })
      }

      onEvent?.({
        type: status === 'waiting_for_human' ? 'tool-waiting-approval' : 'tool-start',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        toolInvocation
      })

      return message
    }

    if (event.type === 'tool-result' || event.type === 'tool-error') {
      const currentToolInvocation = await this.toolInvocationsRepository.findById(event.tool.id)
      const timestamp = createTimestamp()
      const toolInvocation = await this.toolInvocationsRepository.save({
        id: event.tool.id,
        operationId: operation.id,
        messageId: message.id,
        name: event.tool.name,
        arguments: event.tool.input,
        result:
          event.type === 'tool-result' ? (event.tool.output ?? normalizeToolResult(null)) : null,
        error: event.type === 'tool-error' ? (event.tool.error ?? 'Tool call failed.') : null,
        status: event.type === 'tool-result' ? 'done' : 'error',
        createdAt: currentToolInvocation?.createdAt ?? timestamp,
        updatedAt: timestamp
      })

      onEvent?.({
        type: 'tool-finish',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        toolInvocation
      })

      return message
    }

    if (event.type === 'abort') {
      throw new Error(event.reason ?? 'Cancelled by user.')
    }

    return message
  }

  private async resolveProvider(input: SendChatMessageInput): Promise<ResolvedProvider> {
    const settings = await this.settingsRepository.getSettings()

    if (input.sessionId !== undefined) {
      const session = await this.sessionsRepository.findById(input.sessionId)

      if (session === null) {
        throw new Error('Chat session not found.')
      }

      const providerId = input.provider ?? session.provider
      const provider = settings.providers[providerId]

      if (provider === undefined) {
        throw new Error(`Unknown provider: ${providerId}`)
      }

      if (!provider.enabled) {
        throw new Error(`${provider.name} is disabled.`)
      }

      if (!isSupportedChatProvider(provider)) {
        throw new Error(`${provider.name} is not supported for chat.`)
      }

      return {
        session: { ...session, provider: provider.provider },
        provider
      }
    }

    const provider =
      input.provider === undefined
        ? selectDefaultChatProvider(settings)
        : settings.providers[input.provider]

    if (provider === undefined) {
      throw new Error(`Unknown provider: ${input.provider}`)
    }

    if (!provider.enabled) {
      throw new Error(`${provider.name} is disabled.`)
    }

    if (!isSupportedChatProvider(provider)) {
      throw new Error(`${provider.name} is not supported for chat.`)
    }

    return {
      session: null,
      provider
    }
  }

  private async resolveConversationScope(
    input: SendChatMessageInput,
    session: SessionRecord | null,
    provider: ProviderSettings
  ): Promise<ConversationScope> {
    if (session === null) {
      return this.createConversationScope(
        provider,
        createChatTitle(input.content || input.attachments?.[0]?.name || '')
      )
    }

    const thread =
      input.threadId === undefined
        ? await this.getDefaultThread(session.id)
        : await this.threadsRepository.findById(input.threadId)

    if (thread !== null) {
      const topic = await this.topicsRepository.findById(thread.topicId)

      if (topic === null) {
        throw new Error('Chat topic not found.')
      }

      return { session, topic, thread }
    }

    const topic =
      input.topicId === undefined
        ? await this.getDefaultTopic(session.id)
        : await this.topicsRepository.findById(input.topicId)

    if (topic === null) {
      return this.createTopicAndThread(session, defaultTopicTitle, defaultThreadTitle)
    }

    return {
      session,
      topic,
      thread: await this.createThread(topic, defaultThreadTitle)
    }
  }

  private async resolveOperationScope(operation: AgentOperationRecord): Promise<ConversationScope> {
    const sessionId =
      typeof operation.appContext?.sessionId === 'string'
        ? operation.appContext.sessionId
        : undefined

    if (sessionId === undefined || operation.topicId == null || operation.threadId == null) {
      throw new Error('Agent operation context is incomplete.')
    }

    const session = await this.sessionsRepository.findById(sessionId)
    const topic = await this.topicsRepository.findById(operation.topicId)
    const thread = await this.threadsRepository.findById(operation.threadId)

    if (session === null || topic === null || thread === null) {
      throw new Error('Agent operation context not found.')
    }

    return { session, topic, thread }
  }

  private async resolveOperationProvider(
    operation: AgentOperationRecord,
    session: SessionRecord
  ): Promise<ProviderSettings> {
    const settings = await this.settingsRepository.getSettings()
    const providerId = operation.provider ?? session.provider
    const provider = settings.providers[providerId]

    if (provider === undefined) {
      throw new Error(`Unknown provider: ${providerId}`)
    }

    if (!provider.enabled) {
      throw new Error(`${provider.name} is disabled.`)
    }

    if (!isSupportedChatProvider(provider)) {
      throw new Error(`${provider.name} is not supported for chat.`)
    }

    return this.withStoredApiKey(provider)
  }

  private async createConversationScope(
    provider: ProviderSettings,
    title: string
  ): Promise<ConversationScope> {
    const timestamp = createTimestamp()
    const session = await this.sessionsRepository.save({
      id: randomUUID(),
      projectId: null,
      provider: provider.provider,
      title,
      status: 'active',
      userId: defaultChatUserId,
      createdAt: timestamp,
      updatedAt: timestamp
    })

    return this.createTopicAndThread(session, title, defaultThreadTitle)
  }

  private async createTopicAndThread(
    session: SessionRecord,
    topicTitle: string,
    threadTitle: string
  ): Promise<ConversationScope> {
    const timestamp = createTimestamp()
    const topic = await this.topicsRepository.save({
      id: randomUUID(),
      sessionId: session.id,
      title: topicTitle,
      userId: defaultChatUserId,
      trigger: 'chat',
      mode: 'default',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const thread = await this.threadsRepository.save({
      id: randomUUID(),
      topicId: topic.id,
      title: threadTitle,
      type: 'standalone',
      status: 'active',
      userId: defaultChatUserId,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    })

    return { session, topic, thread }
  }

  private async createThread(topic: TopicRecord, title: string): Promise<ThreadRecord> {
    const timestamp = createTimestamp()

    return this.threadsRepository.save({
      id: randomUUID(),
      topicId: topic.id,
      title,
      type: 'continuation',
      status: 'active',
      userId: defaultChatUserId,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  private async createOperation(
    scope: ConversationScope,
    provider: ProviderSettings,
    modelId: string,
    status: AgentOperationRecord['status'] = 'running'
  ): Promise<AgentOperationRecord> {
    const timestamp = createTimestamp()

    return this.agentOperationsRepository.save({
      id: randomUUID(),
      userId: defaultChatUserId,
      topicId: scope.topic.id,
      threadId: scope.thread.id,
      status,
      ...(status === 'running' ? { startedAt: timestamp } : {}),
      model: modelId,
      provider: provider.provider,
      trigger: 'chat',
      appContext: {
        sessionId: scope.session.id
      },
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  private async getDefaultTopic(sessionId: string): Promise<TopicRecord | null> {
    const topics = await this.topicsRepository.listBySession(sessionId)

    return topics[0] ?? null
  }

  private async getDefaultThread(sessionId: string): Promise<ThreadRecord | null> {
    const threads = await this.threadsRepository.listBySession(sessionId)

    return threads[0] ?? null
  }

  private async touchSessionWithTitle(
    session: SessionRecord,
    title: string
  ): Promise<SessionRecord> {
    const shouldUpdateTitle = session.title === newChatTitle || session.title === ''

    return this.sessionsRepository.save({
      ...session,
      title: shouldUpdateTitle ? title : session.title,
      updatedAt: createTimestamp()
    })
  }

  private async touchTopicTitle(topic: TopicRecord, title: string): Promise<TopicRecord> {
    const shouldUpdateTitle = topic.title === defaultTopicTitle || topic.title === newChatTitle

    return this.topicsRepository.save({
      ...topic,
      title: shouldUpdateTitle ? title : topic.title,
      updatedAt: createTimestamp()
    })
  }

  private async touchThreadTitle(thread: ThreadRecord, title: string): Promise<ThreadRecord> {
    const shouldUpdateTitle = thread.title === defaultThreadTitle || thread.title === newChatTitle
    const timestamp = createTimestamp()

    return this.threadsRepository.save({
      ...thread,
      title: shouldUpdateTitle ? title : thread.title,
      lastActiveAt: timestamp,
      updatedAt: timestamp
    })
  }

  private async withStoredApiKey(provider: ProviderSettings): Promise<ProviderSettings> {
    const apiKey = await this.settingsRepository.getProviderApiKey(provider.provider)

    return {
      ...provider,
      apiKey
    }
  }
}
