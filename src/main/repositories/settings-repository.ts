import { eq } from 'drizzle-orm'

import {
  appearanceThemes,
  createDefaultAppSettings,
  type AppearanceSettings,
  type AppearanceTheme,
  type AppSettings
} from '../../shared/domain/settings'
import type { ProviderId } from '../../shared/domain/provider'
import type { AppDatabaseConnection } from '../db/connection'
import { providerSettings, settings as settingsTable } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'
import type { SecretCodec } from '../security/secret-codec'

type ProviderSettingsDraft = {
  apiKey: string
  model: string
  baseUrl: string
}

const appearanceThemeKey = 'appearance.theme'
const appearanceThemeSet = new Set<AppearanceTheme>(appearanceThemes)

function createApiKeyPreview(apiKey: string): string {
  const trimmedApiKey = apiKey.trim()

  if (trimmedApiKey.length === 0) {
    return ''
  }

  if (trimmedApiKey.length <= 4) {
    return '****'
  }

  return `****${trimmedApiKey.slice(-4)}`
}

export class SettingsRepository {
  constructor(
    private readonly database: AppDatabaseConnection,
    private readonly secretCodec: SecretCodec
  ) {}

  async getSettings(): Promise<AppSettings> {
    const settings = createDefaultAppSettings()
    const appearanceTheme = await this.getSettingValue(appearanceThemeKey)

    if (appearanceTheme !== null && appearanceThemeSet.has(appearanceTheme as AppearanceTheme)) {
      settings.appearance.theme = appearanceTheme as AppearanceTheme
    }

    const rows = await this.database.db.select().from(providerSettings)

    for (const row of rows) {
      const apiKey = this.secretCodec.decrypt(row.encryptedApiKey)

      settings.providers[row.provider] = {
        provider: row.provider,
        hasApiKey: apiKey.trim().length > 0,
        apiKeyPreview: createApiKeyPreview(apiKey),
        model: row.model,
        baseUrl: row.baseUrl,
        updatedAt: toIsoTimestamp(row.updatedAt)
      }
    }

    return settings
  }

  async saveAppearance(draft: AppearanceSettings): Promise<AppSettings> {
    await this.saveSettingValue(appearanceThemeKey, draft.theme)

    return this.getSettings()
  }

  async saveProvider(provider: ProviderId, draft: ProviderSettingsDraft): Promise<AppSettings> {
    const updatedAt = new Date().toISOString()
    const apiKey = draft.apiKey.trim()
    const model = draft.model.trim()
    const baseUrl = draft.baseUrl.trim()
    const encryptedApiKey =
      apiKey.length > 0
        ? this.secretCodec.encrypt(apiKey)
        : await this.getEncryptedProviderKey(provider)

    if (encryptedApiKey === null) {
      throw new Error('API key is required.')
    }

    await this.database.db
      .insert(providerSettings)
      .values({
        provider,
        model,
        baseUrl,
        encryptedApiKey,
        updatedAt
      })
      .onConflictDoUpdate({
        target: providerSettings.provider,
        set: {
          model,
          baseUrl,
          encryptedApiKey,
          updatedAt
        }
      })

    return this.getSettings()
  }

  async getEncryptedProviderKey(provider: ProviderId): Promise<string | null> {
    const row = await this.database.db
      .select({ encryptedApiKey: providerSettings.encryptedApiKey })
      .from(providerSettings)
      .where(eq(providerSettings.provider, provider))
      .then((rows) => rows[0])

    return row?.encryptedApiKey ?? null
  }

  private async getSettingValue(key: string): Promise<string | null> {
    const row = await this.database.db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .then((rows) => rows[0])

    return row?.value ?? null
  }

  private async saveSettingValue(key: string, value: string): Promise<void> {
    const updatedAt = new Date().toISOString()

    await this.database.db
      .insert(settingsTable)
      .values({
        key,
        value,
        updatedAt
      })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: {
          value,
          updatedAt
        }
      })
  }
}
