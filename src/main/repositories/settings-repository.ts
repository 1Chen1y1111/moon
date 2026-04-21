import { eq } from 'drizzle-orm'

import {
  createDefaultAppSettings,
  type AppearanceSettings,
  type AppearanceTheme,
  type AppSettings,
  type ProviderId,
  type ProviderSettings
} from '@ipc/contracts'
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
const appearanceThemes = new Set<AppearanceTheme>(['light', 'dark', 'system'])

export class SettingsRepository {
  constructor(
    private readonly database: AppDatabaseConnection,
    private readonly secretCodec: SecretCodec
  ) {}

  getSettings(): AppSettings {
    const settings = createDefaultAppSettings()
    const appearanceTheme = this.getSettingValue(appearanceThemeKey)

    if (appearanceTheme !== null && appearanceThemes.has(appearanceTheme as AppearanceTheme)) {
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
      settings.providers[row.provider] = {
        provider: row.provider,
        apiKey: this.secretCodec.decrypt(row.encryptedApiKey),
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
    const nextProviderSettings: ProviderSettings = {
      provider,
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
      baseUrl: draft.baseUrl.trim(),
      updatedAt
    }
    const encryptedApiKey = this.secretCodec.encrypt(nextProviderSettings.apiKey)

    if (this.database.kind === 'better-sqlite3') {
      this.database.db
        .insert(providerSettings)
        .values({
          provider,
          model: nextProviderSettings.model,
          baseUrl: nextProviderSettings.baseUrl,
          encryptedApiKey,
          updatedAt
        })
        .onConflictDoUpdate({
          target: providerSettings.provider,
          set: {
            model: nextProviderSettings.model,
            baseUrl: nextProviderSettings.baseUrl,
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
        .run(
          provider,
          nextProviderSettings.model,
          nextProviderSettings.baseUrl,
          encryptedApiKey,
          updatedAt
        )
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
