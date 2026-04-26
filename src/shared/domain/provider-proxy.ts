import type { ProviderId } from './provider'

export const providerProxyPort = 23002
export const providerProxyBaseUrl = `http://localhost:${providerProxyPort}`

export type ProviderProxyEndpoints = {
  responsesUrl: string
  anthropicMessagesUrl: string
  anthropicBaseUrl: string
}

function encodeProviderPath(provider: ProviderId): string {
  return encodeURIComponent(provider)
}

export function createProviderProxyEndpoints(provider: ProviderId): ProviderProxyEndpoints {
  const encodedProvider = encodeProviderPath(provider)

  return {
    responsesUrl: `${providerProxyBaseUrl}/proxy/${encodedProvider}/v1/responses`,
    anthropicMessagesUrl: `${providerProxyBaseUrl}/anthropic-proxy/${encodedProvider}/v1/messages`,
    anthropicBaseUrl: `${providerProxyBaseUrl}/anthropic-proxy/${encodedProvider}`
  }
}
