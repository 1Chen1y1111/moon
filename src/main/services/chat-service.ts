import { randomUUID } from 'node:crypto'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText as streamGeneratedText, type LanguageModel, type ModelMessage } from 'ai'

import type {
  MessageRecord,
  SendMessageEvent,
  SendMessageResult,
  SessionRecord
} from '@shared/domain/chat'
import {
  getChatMessagesInputSchema,
  sendChatMessageInputSchema,
  type GetChatMessagesInput,
  type SendChatMessageInput
} from '@shared/domain/chat-validation'
import type { AppSettings, ProviderSettings } from '@shared/domain/settings'
import type { MessagesRepository } from '../repositories/messages-repository'
import type { SessionsRepository } from '../repositories/sessions-repository'
import type { SettingsRepository } from '../repositories/settings-repository'

const newChatTitle = '新聊天'
const titleMaxLength = 48

type ChatServiceDependencies = {
  settingsRepository: SettingsRepository
  sessionsRepository: SessionsRepository
  messagesRepository: MessagesRepository
  generateText?: GenerateTextFunction
  streamText?: StreamTextFunction
}

type GenerateTextFunction = (input: {
  model: LanguageModel
  messages: ModelMessage[]
}) => Promise<{ text: string }>

type StreamTextFunction = (input: { model: LanguageModel; messages: ModelMessage[] }) => {
  textStream: AsyncIterable<string>
}

type SendMessageEventListener = (event: SendMessageEvent) => void

type ResolvedSessionProvider = {
  session: SessionRecord | null
  provider: ProviderSettings
  existingMessages: MessageRecord[]
}

type AiProviderOptions = {
  baseURL?: string
  apiKey?: string
  headers?: Record<string, string>
}

function createTimestamp(): string {
  return new Date().toISOString()
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

function isOpenAICompatibleProvider(provider: ProviderSettings): boolean {
  return (
    provider.type === 'moonshot' ||
    provider.type === 'aihubmix' ||
    provider.type === 'deepseek' ||
    provider.type === 'openrouter' ||
    provider.type === 'volcengine' ||
    provider.type === 'ollama' ||
    provider.type === 'cloudflare-ai-gateway' ||
    provider.type === 'custom'
  )
}

export function isSupportedChatProvider(provider: ProviderSettings): boolean {
  if (
    provider.isACP ||
    provider.isOAuth ||
    provider.kind === 'coding-plan' ||
    provider.type === 'azure'
  ) {
    return false
  }

  return (
    provider.type === 'openai' ||
    provider.type === 'anthropic' ||
    provider.type === 'google' ||
    provider.apiFormat === 'anthropic' ||
    provider.apiFormat === 'openai-responses' ||
    (provider.apiFormat === 'openai-chat' && isOpenAICompatibleProvider(provider))
  )
}

export function selectDefaultChatProvider(settings: AppSettings): ProviderSettings {
  const provider = Object.values(settings.providers).find(
    (candidate) => candidate.enabled && isSupportedChatProvider(candidate)
  )

  if (provider === undefined) {
    throw new Error('No enabled chat provider configured.')
  }

  return provider
}

export function selectChatModel(provider: ProviderSettings): string {
  const model =
    provider.model.trim() ||
    provider.models.find((candidate) => candidate.enabled)?.id.trim() ||
    provider.availableModels.find((candidate) => candidate.enabled)?.id.trim() ||
    ''

  if (model.length === 0) {
    throw new Error(`No model selected for ${provider.name}.`)
  }

  return model
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

function toModelMessage(message: MessageRecord): ModelMessage | null {
  if (message.role === 'user') {
    return { role: 'user', content: message.content }
  }

  if (message.role === 'assistant') {
    return { role: 'assistant', content: message.content }
  }

  if (message.role === 'system') {
    return { role: 'system', content: message.content }
  }

  return null
}

export class ChatService {
  private readonly settingsRepository: SettingsRepository
  private readonly sessionsRepository: SessionsRepository
  private readonly messagesRepository: MessagesRepository
  private readonly streamText: StreamTextFunction

  constructor({
    generateText: generateTextFunction,
    messagesRepository,
    sessionsRepository,
    settingsRepository,
    streamText: streamTextFunction
  }: ChatServiceDependencies) {
    this.messagesRepository = messagesRepository
    this.sessionsRepository = sessionsRepository
    this.settingsRepository = settingsRepository
    this.streamText =
      streamTextFunction ??
      (generateTextFunction === undefined
        ? (input) => streamGeneratedText(input)
        : (input) => ({
            textStream: (async function* (): AsyncGenerator<string> {
              yield (await generateTextFunction(input)).text
            })()
          }))
  }

  listSessions(): Promise<SessionRecord[]> {
    return this.sessionsRepository.list()
  }

  getMessages(input: GetChatMessagesInput): Promise<MessageRecord[]> {
    const parsedInput = getChatMessagesInputSchema.parse(input)

    return this.messagesRepository.listBySession(parsedInput.sessionId)
  }

  async createSession(): Promise<SessionRecord> {
    const settings = await this.settingsRepository.getSettings()
    const provider = await this.withStoredApiKey(selectDefaultChatProvider(settings))
    const model = selectChatModel(provider)
    const timestamp = createTimestamp()

    createChatLanguageModel(provider, model)

    return this.sessionsRepository.save({
      id: randomUUID(),
      projectId: null,
      provider: provider.provider,
      title: newChatTitle,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  async sendMessage(
    input: SendChatMessageInput,
    onEvent?: SendMessageEventListener
  ): Promise<SendMessageResult> {
    const parsedInput = sendChatMessageInputSchema.parse(input)
    const resolved = await this.resolveSessionProvider(parsedInput)
    const provider = await this.withStoredApiKey(resolved.provider)
    const modelId = selectChatModel(provider)
    const languageModel = createChatLanguageModel(provider, modelId)
    const userTimestamp = createTimestamp()
    const session =
      resolved.session ??
      (await this.sessionsRepository.save({
        id: randomUUID(),
        projectId: null,
        provider: provider.provider,
        title: createChatTitle(parsedInput.content),
        status: 'active',
        createdAt: userTimestamp,
        updatedAt: userTimestamp
      }))
    const shouldUpdateTitle =
      resolved.session !== null &&
      !resolved.existingMessages.some((message) => message.role === 'user')
    const sessionAfterUser = await this.sessionsRepository.save({
      ...session,
      title: shouldUpdateTitle ? createChatTitle(parsedInput.content) : session.title,
      updatedAt: userTimestamp
    })
    const userMessage = await this.messagesRepository.save({
      id: randomUUID(),
      sessionId: sessionAfterUser.id,
      role: 'user',
      content: parsedInput.content,
      createdAt: userTimestamp,
      updatedAt: userTimestamp
    })
    onEvent?.({ type: 'user-message', session: sessionAfterUser, message: userMessage })
    const modelMessages = [...resolved.existingMessages, userMessage]
      .map(toModelMessage)
      .filter((message): message is ModelMessage => message !== null)
    const assistantTimestamp = createTimestamp()
    const assistantMessageId = randomUUID()
    let assistantText = ''

    onEvent?.({
      type: 'assistant-start',
      message: {
        id: assistantMessageId,
        sessionId: sessionAfterUser.id,
        role: 'assistant',
        content: '',
        createdAt: assistantTimestamp,
        updatedAt: assistantTimestamp
      }
    })

    const result = this.streamText({
      model: languageModel,
      messages: modelMessages
    })

    for await (const textPart of result.textStream) {
      assistantText += textPart

      if (textPart.length > 0) {
        onEvent?.({ type: 'assistant-delta', messageId: assistantMessageId, delta: textPart })
      }
    }

    const assistantTextContent = assistantText.trim()

    if (assistantTextContent.length === 0) {
      throw new Error('Model returned an empty response.')
    }

    const assistantMessage = await this.messagesRepository.save({
      id: assistantMessageId,
      sessionId: sessionAfterUser.id,
      role: 'assistant',
      content: assistantTextContent,
      createdAt: assistantTimestamp,
      updatedAt: assistantTimestamp
    })

    const sessionAfterAssistant = await this.sessionsRepository.save({
      ...sessionAfterUser,
      updatedAt: assistantTimestamp
    })

    onEvent?.({
      type: 'assistant-finish',
      session: sessionAfterAssistant,
      message: assistantMessage
    })

    return {
      session: sessionAfterAssistant,
      messages: await this.messagesRepository.listBySession(sessionAfterAssistant.id)
    }
  }

  private async resolveSessionProvider(
    input: SendChatMessageInput
  ): Promise<ResolvedSessionProvider> {
    const settings = await this.settingsRepository.getSettings()

    if (input.sessionId !== undefined) {
      const session = await this.sessionsRepository.findById(input.sessionId)

      if (session === null) {
        throw new Error('Chat session not found.')
      }

      const provider = settings.providers[session.provider]

      if (provider === undefined) {
        throw new Error(`Unknown provider: ${session.provider}`)
      }

      if (!provider.enabled) {
        throw new Error(`${provider.name} is disabled.`)
      }

      if (!isSupportedChatProvider(provider)) {
        throw new Error(`${provider.name} is not supported for chat.`)
      }

      return {
        session,
        provider,
        existingMessages: await this.messagesRepository.listBySession(session.id)
      }
    }

    const provider = selectDefaultChatProvider(settings)

    return {
      session: null,
      provider,
      existingMessages: []
    }
  }

  private async withStoredApiKey(provider: ProviderSettings): Promise<ProviderSettings> {
    const apiKey = await this.settingsRepository.getProviderApiKey(provider.provider)

    return {
      ...provider,
      apiKey
    }
  }
}
