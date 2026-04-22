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
import type { SecretCodec } from '../security/secret-codec'

type ProviderSettingsDraft = {
  apiKey: string
  model: string
  baseUrl: string
}

type ProviderSettingsRow = {
  provider: ProviderId
  model: string
  base_url: string
  encrypted_api_key: string
  updated_at: string
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

  getSettings(): AppSettings {
    const settings = createDefaultAppSettings()
    const appearanceTheme = this.getSettingValue(appearanceThemeKey)

    if (appearanceTheme !== null && appearanceThemeSet.has(appearanceTheme as AppearanceTheme)) {
      settings.appearance.theme = appearanceTheme as AppearanceTheme
    }

    const rows =
      this.database.kind === 'better-sqlite3'
        ? this.database.db.select().from(providerSettings).all()
        : this.database.client
            .prepare(
              'SELECT provider, model, base_url, encrypted_api_key, updated_at FROM provider_settings'
            )
            .all<ProviderSettingsRow>()
            .map((row) => ({
              provider: row.provider,
              model: row.model,
              baseUrl: row.base_url,
              encryptedApiKey: row.encrypted_api_key,
              updatedAt: row.updated_at
            }))

    for (const row of rows) {
      const apiKey = this.secretCodec.decrypt(row.encryptedApiKey)

      settings.providers[row.provider] = {
        provider: row.provider,
        hasApiKey: apiKey.trim().length > 0,
        apiKeyPreview: createApiKeyPreview(apiKey),
        model: row.model,
        baseUrl: row.baseUrl,
        updatedAt: row.updatedAt
      }
    }

    return settings
  }

  saveAppearance(draft: AppearanceSettings): AppSettings {
    this.saveSettingValue(appearanceThemeKey, draft.theme)

    return this.getSettings()
  }

  saveProvider(provider: ProviderId, draft: ProviderSettingsDraft): AppSettings {
    const updatedAt = new Date().toISOString()
    const apiKey = draft.apiKey.trim()
    const model = draft.model.trim()
    const baseUrl = draft.baseUrl.trim()
    const encryptedApiKey =
      apiKey.length > 0 ? this.secretCodec.encrypt(apiKey) : this.getEncryptedProviderKey(provider)

    if (encryptedApiKey === null) {
      throw new Error('API key is required.')
    }

    if (this.database.kind === 'better-sqlite3') {
      this.database.db
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
        .run()
    } else {
      this.database.client
        .prepare(
          `
            INSERT INTO provider_settings (provider, model, base_url, encrypted_api_key, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(provider) DO UPDATE SET
              model = excluded.model,
              base_url = excluded.base_url,
              encrypted_api_key = excluded.encrypted_api_key,
              updated_at = excluded.updated_at
          `
        )
        .run(provider, model, baseUrl, encryptedApiKey, updatedAt)
    }

    return this.getSettings()
  }

  getEncryptedProviderKey(provider: ProviderId): string | null {
    const row =
      this.database.kind === 'better-sqlite3'
        ? this.database.db
            .select({ encryptedApiKey: providerSettings.encryptedApiKey })
            .from(providerSettings)
            .where(eq(providerSettings.provider, provider))
            .get()
        : this.database.client
            .prepare(
              'SELECT encrypted_api_key AS encryptedApiKey FROM provider_settings WHERE provider = ?'
            )
            .get<{ encryptedApiKey: string }>(provider)

    return row?.encryptedApiKey ?? null
  }

  private getSettingValue(key: string): string | null {
    const row =
      this.database.kind === 'better-sqlite3'
        ? this.database.db
            .select({ value: settingsTable.value })
            .from(settingsTable)
            .where(eq(settingsTable.key, key))
            .get()
        : this.database.client
            .prepare('SELECT value FROM settings WHERE key = ?')
            .get<{ value: string }>(key)

    return row?.value ?? null
  }

  private saveSettingValue(key: string, value: string): void {
    const updatedAt = new Date().toISOString()

    if (this.database.kind === 'better-sqlite3') {
      this.database.db
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
        .run()
      return
    }

    this.database.client
      .prepare(
        `
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `
      )
      .run(key, value, updatedAt)
  }
}
