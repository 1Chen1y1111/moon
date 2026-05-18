import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'

import {
  createProviderProxyEndpoints,
  providerProxyBaseUrl,
  providerProxyPort
} from '@moon/shared/domain/provider-proxy'
import type { ProviderSettings } from '@moon/shared/domain/settings'
import type { SettingsRepository } from '../repositories/settings-repository'

const anthropicVersion = '2023-06-01'
const maxBodyBytes = 2 * 1024 * 1024

type JsonRecord = Record<string, unknown>

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ProxyChatRequest = {
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  stream: boolean
}

type ResolvedProvider = ProviderSettings & {
  apiKey: string
  resolvedBaseUrl: string
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getString(record: JsonRecord, key: string): string {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

function getNumber(record: JsonRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'number') {
      return value
    }
  }

  return undefined
}

function getBoolean(record: JsonRecord, key: string): boolean {
  const value = record[key]

  return typeof value === 'boolean' ? value : false
}

function joinEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/g, '')}/${path.replace(/^\/+/g, '')}`
}

function joinVersionedEndpoint(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/g, '')

  if (/\/v\d+(beta)?$/u.test(normalizedBaseUrl)) {
    return joinEndpoint(normalizedBaseUrl, path.replace(/^v\d+(beta)?\/?/u, ''))
  }

  return joinEndpoint(normalizedBaseUrl, path)
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

function createHeaders(provider: ResolvedProvider, target: 'openai' | 'anthropic'): HeadersInit {
  const headers: Record<string, string> = {
    ...parseCustomHeaders(provider.customHeaders),
    'content-type': 'application/json'
  }

  if (target === 'anthropic') {
    headers['x-api-key'] = provider.apiKey
    headers['anthropic-version'] = anthropicVersion
    return headers
  }

  if (provider.type !== 'google' && provider.apiKey.length > 0) {
    headers['authorization'] = `Bearer ${provider.apiKey}`
  }

  return headers
}

function readContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry
        }

        if (!isRecord(entry)) {
          return ''
        }

        if (typeof entry['text'] === 'string') {
          return entry['text']
        }

        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  if (isRecord(content) && typeof content['text'] === 'string') {
    return content['text']
  }

  return ''
}

function normalizeRole(value: unknown): ChatMessage['role'] {
  if (value === 'assistant') {
    return 'assistant'
  }

  if (value === 'system' || value === 'developer') {
    return 'system'
  }

  return 'user'
}

function ensureMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length > 0) {
    return messages
  }

  return [{ role: 'user', content: '' }]
}

function createRequestFromResponsesPayload(payload: unknown): ProxyChatRequest {
  if (!isRecord(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.')
  }

  const messages: ChatMessage[] = []
  const instructions = readContentText(payload['instructions'])

  if (instructions.length > 0) {
    messages.push({ role: 'system', content: instructions })
  }

  const input = payload['input']

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input })
  } else if (Array.isArray(input)) {
    for (const entry of input) {
      if (!isRecord(entry)) {
        continue
      }

      messages.push({
        role: normalizeRole(entry['role']),
        content: readContentText(entry['content'])
      })
    }
  } else if (Array.isArray(payload['messages'])) {
    for (const entry of payload['messages']) {
      if (!isRecord(entry)) {
        continue
      }

      messages.push({
        role: normalizeRole(entry['role']),
        content: readContentText(entry['content'])
      })
    }
  }

  return {
    model: getString(payload, 'model'),
    messages: ensureMessages(messages),
    maxTokens: getNumber(payload, 'max_output_tokens', 'max_tokens'),
    temperature: getNumber(payload, 'temperature'),
    stream: getBoolean(payload, 'stream')
  }
}

function createRequestFromAnthropicPayload(payload: unknown): ProxyChatRequest {
  if (!isRecord(payload)) {
    throw new HttpError(400, 'Request body must be a JSON object.')
  }

  const messages: ChatMessage[] = []
  const system = readContentText(payload['system'])

  if (system.length > 0) {
    messages.push({ role: 'system', content: system })
  }

  if (Array.isArray(payload['messages'])) {
    for (const entry of payload['messages']) {
      if (!isRecord(entry)) {
        continue
      }

      messages.push({
        role: normalizeRole(entry['role']),
        content: readContentText(entry['content'])
      })
    }
  }

  return {
    model: getString(payload, 'model'),
    messages: ensureMessages(messages),
    maxTokens: getNumber(payload, 'max_tokens'),
    temperature: getNumber(payload, 'temperature'),
    stream: getBoolean(payload, 'stream')
  }
}

function pickModel(provider: ResolvedProvider, requestedModel: string): string {
  return (
    requestedModel ||
    provider.model ||
    provider.models.find((model) => model.enabled)?.id ||
    provider.availableModels.find((model) => model.enabled)?.id ||
    ''
  )
}

async function readErrorResponse(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')

  if (body.trim().length === 0) {
    return `HTTP ${response.status}`
  }

  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string }
      message?: string
    }

    if (typeof parsed.error === 'string') {
      return parsed.error
    }

    if (typeof parsed.error?.message === 'string') {
      return parsed.error.message
    }

    if (typeof parsed.message === 'string') {
      return parsed.message
    }
  } catch {
    // Return the raw body below.
  }

  return body.slice(0, 300)
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)

  if (!response.ok) {
    throw new HttpError(response.status, await readErrorResponse(response))
  }

  return response.json()
}

function extractProviderText(payload: unknown): string {
  if (!isRecord(payload)) {
    return ''
  }

  const outputText = payload['output_text']

  if (typeof outputText === 'string') {
    return outputText
  }

  const content = payload['content']

  if (Array.isArray(content)) {
    return readContentText(content)
  }

  const choices = payload['choices']

  if (Array.isArray(choices) && isRecord(choices[0])) {
    const message = choices[0]['message']

    if (isRecord(message)) {
      return readContentText(message['content'])
    }
  }

  const output = payload['output']

  if (Array.isArray(output)) {
    return output
      .map((entry) => (isRecord(entry) ? readContentText(entry['content']) : ''))
      .join('')
  }

  const candidates = payload['candidates']

  if (Array.isArray(candidates) && isRecord(candidates[0])) {
    const candidateContent = candidates[0]['content']

    if (isRecord(candidateContent)) {
      return readContentText(candidateContent['parts'])
    }
  }

  return ''
}

async function createProviderCompletion(
  provider: ResolvedProvider,
  request: ProxyChatRequest
): Promise<{ model: string; text: string }> {
  const model = pickModel(provider, request.model)

  if (model.length === 0) {
    throw new HttpError(400, 'No model selected.')
  }

  const maxTokens = request.maxTokens ?? 1024

  if (provider.type === 'google') {
    const systemText = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n')
    const contents = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      }))
    const payload = await fetchJson(
      `${joinEndpoint(provider.resolvedBaseUrl, `models/${model}:generateContent`)}?key=${encodeURIComponent(
        provider.apiKey
      )}`,
      {
        body: JSON.stringify({
          contents,
          ...(systemText.length > 0
            ? { systemInstruction: { parts: [{ text: systemText }] } }
            : {}),
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(request.temperature === undefined ? {} : { temperature: request.temperature })
          }
        }),
        headers: createHeaders(provider, 'openai'),
        method: 'POST'
      }
    )

    return { model, text: extractProviderText(payload) }
  }

  if (provider.apiFormat === 'anthropic' || provider.type === 'anthropic') {
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n')
    const messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content }))
    const payload = await fetchJson(
      joinVersionedEndpoint(provider.resolvedBaseUrl, 'v1/messages'),
      {
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          ...(system.length > 0 ? { system } : {}),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature })
        }),
        headers: createHeaders(provider, 'anthropic'),
        method: 'POST'
      }
    )

    return { model, text: extractProviderText(payload) }
  }

  if (provider.apiFormat === 'openai-responses') {
    const payload = await fetchJson(joinEndpoint(provider.resolvedBaseUrl, 'responses'), {
      body: JSON.stringify({
        model,
        input: request.messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        max_output_tokens: maxTokens,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature })
      }),
      headers: createHeaders(provider, 'openai'),
      method: 'POST'
    })

    return { model, text: extractProviderText(payload) }
  }

  const payload = await fetchJson(joinEndpoint(provider.resolvedBaseUrl, 'chat/completions'), {
    body: JSON.stringify({
      model,
      messages: request.messages,
      stream: false,
      [provider.useMaxCompletionTokens ? 'max_completion_tokens' : 'max_tokens']: maxTokens,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature })
    }),
    headers: createHeaders(provider, 'openai'),
    method: 'POST'
  })

  return { model, text: extractProviderText(payload) }
}

function createResponsesPayload(model: string, text: string): JsonRecord {
  const id = `resp_${randomUUID()}`

  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output: [
      {
        id: `msg_${randomUUID()}`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }]
      }
    ],
    output_text: text
  }
}

function createAnthropicPayload(model: string, text: string): JsonRecord {
  return {
    id: `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0
    }
  }
}

function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-methods', 'POST, OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type, authorization, x-api-key')
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  writeCorsHeaders(response)
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

function writeResponsesStream(response: ServerResponse, model: string, text: string): void {
  const payload = createResponsesPayload(model, text)

  writeCorsHeaders(response)
  response.writeHead(200, {
    'cache-control': 'no-cache',
    'content-type': 'text/event-stream'
  })
  response.write(`data: ${JSON.stringify({ type: 'response.created', response: payload })}\n\n`)
  response.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n`)
  response.write(
    `data: ${JSON.stringify({ type: 'response.output_text.done', text, response: payload })}\n\n`
  )
  response.write(`data: ${JSON.stringify({ type: 'response.completed', response: payload })}\n\n`)
  response.end('data: [DONE]\n\n')
}

function writeAnthropicStream(response: ServerResponse, model: string, text: string): void {
  const message = createAnthropicPayload(model, text)

  writeCorsHeaders(response)
  response.writeHead(200, {
    'cache-control': 'no-cache',
    'content-type': 'text/event-stream'
  })
  response.write(`event: message_start\ndata: ${JSON.stringify({ ...message, content: [] })}\n\n`)
  response.write(
    `event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' }
    })}\n\n`
  )
  response.write(
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text }
    })}\n\n`
  )
  response.write(`event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`)
  response.write(
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 0 }
    })}\n\n`
  )
  response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n')
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength

    if (totalBytes > maxBodyBytes) {
      throw new HttpError(413, 'Request body is too large.')
    }

    chunks.push(buffer)
  }

  const body = Buffer.concat(chunks).toString('utf8').trim()

  if (body.length === 0) {
    return {}
  }

  try {
    return JSON.parse(body)
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.')
  }
}

function parseProxyRoute(url: URL): { provider: string; target: 'responses' | 'anthropic' } | null {
  const responsesMatch = /^\/proxy\/([^/]+)\/v1\/responses$/u.exec(url.pathname)

  if (responsesMatch) {
    return {
      provider: decodeURIComponent(responsesMatch[1]),
      target: 'responses'
    }
  }

  const anthropicMatch = /^\/anthropic-proxy\/([^/]+)\/v1\/messages$/u.exec(url.pathname)

  if (anthropicMatch) {
    return {
      provider: decodeURIComponent(anthropicMatch[1]),
      target: 'anthropic'
    }
  }

  return null
}

export class ProviderProxyServer {
  private server: Server | null = null
  private readonly sockets = new Set<Socket>()

  constructor(private readonly settingsRepository: SettingsRepository) {}

  start(): void {
    if (this.server !== null) {
      return
    }

    const server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`Provider proxy port ${providerProxyPort} is already in use.`)
        return
      }

      console.error('Provider proxy server failed', error)
    })
    server.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.on('close', () => {
        this.sockets.delete(socket)
      })
    })

    server.listen(providerProxyPort, '127.0.0.1')
    this.server = server
  }

  async stop(): Promise<void> {
    const server = this.server

    if (server === null) {
      return
    }

    this.server = null

    server.closeIdleConnections?.()

    const closePromise = new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })

    server.closeAllConnections?.()
    this.sockets.forEach((socket) => {
      socket.destroy()
    })
    this.sockets.clear()

    await closePromise
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    writeCorsHeaders(response)

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    try {
      const url = new URL(request.url ?? '/', providerProxyBaseUrl)
      const route = parseProxyRoute(url)

      if (route === null) {
        writeJson(response, 404, { error: 'Unknown provider proxy endpoint.' })
        return
      }

      if (request.method !== 'POST') {
        writeJson(response, 405, { error: 'Method not allowed.' })
        return
      }

      const body = await readJsonBody(request)
      const proxyRequest =
        route.target === 'responses'
          ? createRequestFromResponsesPayload(body)
          : createRequestFromAnthropicPayload(body)
      const provider = await this.resolveProvider(route.provider)
      const completion = await createProviderCompletion(provider, proxyRequest)

      if (route.target === 'responses') {
        if (proxyRequest.stream) {
          writeResponsesStream(response, completion.model, completion.text)
          return
        }

        writeJson(response, 200, createResponsesPayload(completion.model, completion.text))
        return
      }

      if (proxyRequest.stream) {
        writeAnthropicStream(response, completion.model, completion.text)
        return
      }

      writeJson(response, 200, createAnthropicPayload(completion.model, completion.text))
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof Error ? error.message : 'Provider proxy request failed.'

      writeJson(response, status, { error: message })
    }
  }

  private async resolveProvider(providerId: string): Promise<ResolvedProvider> {
    const settings = await this.settingsRepository.getSettings()
    const provider = settings.providers[providerId]

    if (provider === undefined) {
      throw new HttpError(404, `Unknown provider: ${providerId}`)
    }

    if (provider.isACP || provider.isOAuth) {
      throw new HttpError(400, 'Provider proxy is only available for HTTP providers.')
    }

    const resolvedBaseUrl = provider.baseUrl.trim() || provider.defaultBaseUrl.trim()

    if (resolvedBaseUrl.length === 0) {
      throw new HttpError(400, 'Base URL is required.')
    }

    const apiKey = await this.settingsRepository.getProviderApiKey(provider.provider)

    if (!provider.noApiKey && apiKey.trim().length === 0) {
      throw new HttpError(400, 'API key is required.')
    }

    return {
      ...provider,
      apiKey,
      resolvedBaseUrl
    }
  }
}

export function getProviderProxyEndpoints(
  provider: ProviderSettings
): ReturnType<typeof createProviderProxyEndpoints> {
  return createProviderProxyEndpoints(provider.provider)
}
