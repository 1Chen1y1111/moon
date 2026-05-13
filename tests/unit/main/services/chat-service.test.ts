// @vitest-environment node

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatService } from '@main/services/chat-service'
import type { MessageRecord, SessionRecord } from '@shared/domain/chat'
import { createDefaultAppSettings, createDefaultProviderSettings } from '@shared/domain/settings'
import type { AppSettings, ProviderSettings } from '@shared/domain/settings'

const aiProviderMocks = vi.hoisted(() => {
  const openaiChat = vi.fn((modelId: string) => ({ kind: 'openai-chat', modelId }))
  const openaiResponses = vi.fn((modelId: string) => ({ kind: 'openai-responses', modelId }))
  const anthropicChat = vi.fn((modelId: string) => ({ kind: 'anthropic-chat', modelId }))
  const googleChat = vi.fn((modelId: string) => ({ kind: 'google-chat', modelId }))
  const compatibleChatModel = vi.fn((modelId: string) => ({
    kind: 'compatible-chat',
    modelId
  }))

  return {
    anthropicChat,
    compatibleChatModel,
    createAnthropic: vi.fn(() => ({ chat: anthropicChat })),
    createGoogleGenerativeAI: vi.fn(() => ({ chat: googleChat })),
    createOpenAI: vi.fn(() => ({ chat: openaiChat, responses: openaiResponses })),
    createOpenAICompatible: vi.fn(() => ({ chatModel: compatibleChatModel })),
    googleChat,
    openaiChat,
    openaiResponses
  }
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: aiProviderMocks.createOpenAI
}))

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: aiProviderMocks.createOpenAICompatible
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: aiProviderMocks.createAnthropic
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: aiProviderMocks.createGoogleGenerativeAI
}))

function createProviderSettings(
  input: Partial<ProviderSettings> & Pick<ProviderSettings, 'provider'>
): ProviderSettings {
  const defaults = createDefaultProviderSettings(input.provider)

  return {
    ...defaults,
    enabled: true,
    apiKey: 'stored-key',
    hasApiKey: true,
    model: 'test-model',
    ...input
  }
}

function createSettings(providers: ProviderSettings[]): AppSettings {
  return {
    ...createDefaultAppSettings(),
    providers: Object.fromEntries(providers.map((provider) => [provider.provider, provider]))
  }
}

class SessionsRepositoryMock {
  readonly sessions: SessionRecord[]

  constructor(sessions: SessionRecord[] = []) {
    this.sessions = sessions
  }

  async list(): Promise<SessionRecord[]> {
    return this.sessions
  }

  async findById(id: string): Promise<SessionRecord | null> {
    return this.sessions.find((session) => session.id === id) ?? null
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const index = this.sessions.findIndex((candidate) => candidate.id === session.id)

    if (index === -1) {
      this.sessions.push(session)
    } else {
      this.sessions[index] = session
    }

    return session
  }
}

class MessagesRepositoryMock {
  readonly messages: MessageRecord[]

  constructor(messages: MessageRecord[] = []) {
    this.messages = messages
  }

  async listBySession(sessionId: string): Promise<MessageRecord[]> {
    return this.messages.filter((message) => message.sessionId === sessionId)
  }

  async save(message: MessageRecord): Promise<MessageRecord> {
    this.messages.push(message)

    return message
  }
}

type CreateServiceResult = {
  messagesRepository: MessagesRepositoryMock
  service: ChatService
  sessionsRepository: SessionsRepositoryMock
  settingsRepository: {
    getProviderApiKey: (provider: string) => Promise<string>
    getSettings: () => Promise<AppSettings>
  }
}

function createService(input: {
  attachmentsDirectory?: string
  generateText?: (input: never) => Promise<{ text: string }>
  messages?: MessageRecord[]
  sessions?: SessionRecord[]
  settings: AppSettings
  streamText?: (input: never) => { textStream: AsyncIterable<string> }
}): CreateServiceResult {
  const sessionsRepository = new SessionsRepositoryMock(input.sessions)
  const messagesRepository = new MessagesRepositoryMock(input.messages)
  const settingsRepository = {
    getProviderApiKey: vi.fn(
      async (provider: string) => input.settings.providers[provider]?.apiKey ?? ''
    ),
    getSettings: vi.fn(async () => input.settings)
  }

  return {
    messagesRepository,
    service: new ChatService({
      attachmentsDirectory: input.attachmentsDirectory,
      generateText: input.generateText as never,
      messagesRepository: messagesRepository as never,
      sessionsRepository: sessionsRepository as never,
      settingsRepository: settingsRepository as never,
      streamText: input.streamText as never
    }),
    sessionsRepository,
    settingsRepository
  }
}

describe('ChatService provider resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects the first enabled supported non-ACP provider', async () => {
    const { selectDefaultChatProvider } = await import('@main/services/chat-service')
    const azure = createProviderSettings({
      provider: 'azure-openai',
      type: 'azure',
      model: 'deployment'
    })
    const codingPlan = createProviderSettings({
      provider: 'z-ai-coding-plan',
      kind: 'coding-plan',
      type: 'zai-coding-plan',
      model: 'glm-4.6'
    })
    const openai = createProviderSettings({
      provider: 'openai',
      model: 'gpt-5.4'
    })

    expect(selectDefaultChatProvider(createSettings([azure, codingPlan, openai]))).toBe(openai)
    expect(() => selectDefaultChatProvider(createSettings([azure, codingPlan]))).toThrow(
      'No enabled chat provider configured.'
    )
  })

  it('falls back from selected model to enabled model lists', async () => {
    const { selectChatModel } = await import('@main/services/chat-service')

    expect(
      selectChatModel(
        createProviderSettings({
          provider: 'openai',
          model: '',
          models: [{ id: 'model-list-id', name: 'Model List ID', enabled: true, isManual: true }],
          availableModels: [
            { id: 'available-id', name: 'Available ID', enabled: true, isManual: false }
          ]
        })
      )
    ).toBe('model-list-id')
    expect(
      selectChatModel(
        createProviderSettings({
          provider: 'openai',
          model: '',
          models: [],
          availableModels: [
            { id: 'available-id', name: 'Available ID', enabled: true, isManual: false }
          ]
        })
      )
    ).toBe('available-id')
    expect(() =>
      selectChatModel(
        createProviderSettings({
          provider: 'openai',
          model: '',
          models: [],
          availableModels: []
        })
      )
    ).toThrow('No model selected')
  })
})

describe('createChatLanguageModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds OpenAI chat and responses models', async () => {
    const { createChatLanguageModel } = await import('@main/services/chat-service')
    const provider = createProviderSettings({
      provider: 'openai',
      type: 'openai',
      apiFormat: 'openai-chat',
      baseUrl: 'https://api.openai.com/v1',
      customHeaders: '{"X-Test":1}'
    })

    createChatLanguageModel(provider, 'gpt-5.4')
    createChatLanguageModel({ ...provider, apiFormat: 'openai-responses' }, 'gpt-5.4')

    expect(aiProviderMocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'stored-key',
      baseURL: 'https://api.openai.com/v1',
      headers: { 'X-Test': '1' }
    })
    expect(aiProviderMocks.openaiChat).toHaveBeenCalledWith('gpt-5.4')
    expect(aiProviderMocks.openaiResponses).toHaveBeenCalledWith('gpt-5.4')
  })

  it('builds compatible, Anthropic, Gemini, and no-key Ollama providers', async () => {
    const { createChatLanguageModel } = await import('@main/services/chat-service')

    createChatLanguageModel(
      createProviderSettings({
        provider: 'deepseek',
        type: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1'
      }),
      'deepseek-chat'
    )
    createChatLanguageModel(
      createProviderSettings({
        provider: 'claude',
        type: 'anthropic',
        apiFormat: 'anthropic',
        baseUrl: 'https://api.anthropic.com'
      }),
      'claude-sonnet-4-5'
    )
    createChatLanguageModel(
      createProviderSettings({
        provider: 'gemini',
        type: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
      }),
      'gemini-2.5-pro'
    )
    createChatLanguageModel(
      createProviderSettings({
        provider: 'ollama',
        type: 'ollama',
        apiKey: '',
        hasApiKey: false,
        noApiKey: true,
        baseUrl: 'http://localhost:11434/v1'
      }),
      'llama3.2'
    )

    expect(aiProviderMocks.createOpenAICompatible).toHaveBeenCalledWith({
      apiKey: 'stored-key',
      baseURL: 'https://api.deepseek.com/v1',
      name: 'deepseek'
    })
    expect(aiProviderMocks.createAnthropic).toHaveBeenCalledWith({
      apiKey: 'stored-key',
      baseURL: 'https://api.anthropic.com/v1'
    })
    expect(aiProviderMocks.createGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: 'stored-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta'
    })
    expect(aiProviderMocks.createOpenAICompatible).toHaveBeenCalledWith({
      baseURL: 'http://localhost:11434/v1',
      name: 'ollama'
    })
  })
})

describe('ChatService.sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves user and assistant messages for a new session', async () => {
    const settings = createSettings([
      createProviderSettings({
        provider: 'openai',
        type: 'openai',
        model: 'gpt-5.4'
      })
    ])
    const { messagesRepository, service, sessionsRepository } = createService({
      generateText: vi.fn(async () => ({ text: ' 你好，Moon 已经在线。 ' })),
      settings
    })

    const result = await service.sendMessage({ content: '  你好 Moon  ' })

    expect(result.session.title).toBe('你好 Moon')
    expect(sessionsRepository.sessions).toHaveLength(1)
    expect(messagesRepository.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant'
    ])
    expect(messagesRepository.messages.map((message) => message.content)).toEqual([
      '你好 Moon',
      '你好，Moon 已经在线。'
    ])
  })

  it('uses the requested provider for a new session', async () => {
    const settings = createSettings([
      createProviderSettings({
        provider: 'openai',
        type: 'openai',
        model: 'gpt-5.4'
      }),
      createProviderSettings({
        provider: 'deepseek',
        model: 'deepseek-chat'
      })
    ])
    const { service, sessionsRepository } = createService({
      generateText: vi.fn(async () => ({ text: 'ok' })),
      settings
    })

    await service.sendMessage({ provider: 'deepseek', content: 'hello' })

    expect(sessionsRepository.sessions[0].provider).toBe('deepseek')
  })

  it('uses the requested provider for an existing session', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      projectId: null,
      provider: 'openai',
      title: 'Plan',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const settings = createSettings([
      createProviderSettings({
        provider: 'openai',
        type: 'openai',
        model: 'gpt-5.4'
      }),
      createProviderSettings({
        provider: 'deepseek',
        model: 'deepseek-chat'
      })
    ])
    const { service, sessionsRepository } = createService({
      generateText: vi.fn(async () => ({ text: 'ok' })),
      sessions: [session],
      settings
    })

    await service.sendMessage({
      sessionId: 'session-1',
      provider: 'deepseek',
      content: 'hello'
    })

    expect(sessionsRepository.sessions[0].provider).toBe('deepseek')
  })

  it('keeps the user message but does not save an empty assistant response', async () => {
    const session: SessionRecord = {
      id: 'session-1',
      projectId: null,
      provider: 'openai',
      title: '新聊天',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const settings = createSettings([
      createProviderSettings({
        provider: 'openai',
        type: 'openai',
        model: 'gpt-5.4'
      })
    ])
    const { messagesRepository, service } = createService({
      generateText: vi.fn(async () => ({ text: '   ' })),
      sessions: [session],
      settings
    })

    await expect(service.sendMessage({ sessionId: 'session-1', content: '继续' })).rejects.toThrow(
      'Model returned an empty response.'
    )
    expect(messagesRepository.messages).toHaveLength(1)
    expect(messagesRepository.messages[0]).toMatchObject({
      content: '继续',
      role: 'user',
      sessionId: 'session-1'
    })
  })

  it('emits saved user and assistant stream events while sending', async () => {
    const settings = createSettings([
      createProviderSettings({
        provider: 'openai',
        type: 'openai',
        model: 'gpt-5.4'
      })
    ])
    const events: unknown[] = []
    const { service } = createService({
      settings,
      streamText: vi.fn(() => ({
        textStream: (async function* (): AsyncGenerator<string> {
          yield '你好'
          yield '，Moon'
        })()
      }))
    })

    const result = await service.sendMessage({ content: '测试' }, (event) => events.push(event))

    expect(result.messages.map((message) => message.content)).toEqual(['测试', '你好，Moon'])
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      'user-message',
      'assistant-start',
      'assistant-delta',
      'assistant-delta',
      'assistant-finish'
    ])
  })

  it('sends stored attachments as model message parts', async () => {
    const attachmentsDirectory = await mkdtemp(join(tmpdir(), 'moon-chat-attachments-'))
    const settings = createSettings([
      createProviderSettings({
        provider: 'openai',
        type: 'openai',
        model: 'gpt-5.4'
      })
    ])
    const streamText = vi.fn(() => ({
      textStream: (async function* (): AsyncGenerator<string> {
        yield 'ok'
      })()
    }))
    const { messagesRepository, service } = createService({
      attachmentsDirectory,
      settings,
      streamText: streamText as never
    })

    await writeFile(join(attachmentsDirectory, '11111111-1111-4111-8111-111111111111'), 'hello')

    await service.sendMessage({
      content: 'read this',
      attachments: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'note.txt',
          mimeType: 'text/plain',
          size: 5,
          kind: 'file',
          createdAt: '2026-05-09T00:00:00.000Z'
        }
      ]
    })

    expect(messagesRepository.messages[0].attachments).toEqual([
      expect.objectContaining({ name: 'note.txt', kind: 'file' })
    ])
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              { type: 'text', text: 'read this' },
              { type: 'text', text: '\n\n[Attachment: note.txt]\nhello' }
            ])
          })
        ]
      })
    )
  })

  it('does not create a session when provider setup is incomplete', async () => {
    const settings = createSettings([
      createProviderSettings({
        provider: 'openai',
        apiKey: '',
        hasApiKey: false,
        type: 'openai'
      })
    ])
    const { service, sessionsRepository } = createService({ settings })

    await expect(service.sendMessage({ content: 'hello' })).rejects.toThrow('API key is required')
    expect(sessionsRepository.sessions).toEqual([])
  })
})
