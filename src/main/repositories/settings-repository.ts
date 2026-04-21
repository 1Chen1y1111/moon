import { eq } from 'drizzle-orm'

import {
  createDefaultAppSettings,
  type AppSettings,
  type ProviderId,
  type ProviderSettings
} from '@ipc/contracts'
import type { AppDatabaseConnection } from '../db/connection'
import { providerSettings } from '../db/schema'
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

export class SettingsRepository {
  constructor(
    private readonly database: AppDatabaseConnection,
    private readonly secretCodec: SecretCodec
  ) {}

  getSettings(): AppSettings {
    const settings = createDefaultAppSettings()
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
}
