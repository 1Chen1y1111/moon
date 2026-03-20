import type { DatabaseConnection } from '../db/connection'
import { tableNames } from '../db/schema'
import type { AppSettings, ProviderDraft, ProviderId } from '../ipc/contracts'

const settingsKeys: Record<ProviderId, string> = {
  claude: 'provider:claude'
}

const upsertSettingStatement = `
  INSERT INTO ${tableNames.settings} (key, value, updated_at)
  VALUES (@key, @value, @updatedAt)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`

type SettingRow = {
  value: string
}

function createDefaultSettings(): AppSettings {
  return {
    providerDrafts: {
      claude: {
        apiKey: '',
        model: ''
      }
    }
  }
}

export class SettingsRepository {
  constructor(private readonly database: DatabaseConnection) {}

  getSettings(): AppSettings {
    const settings = createDefaultSettings()
    const claudeDraft = this.readJson<ProviderDraft>(settingsKeys.claude)

    if (claudeDraft !== null) {
      settings.providerDrafts.claude = {
        apiKey: claudeDraft.apiKey,
        model: claudeDraft.model
      }
    }

    return settings
  }

  saveProviderDraft(provider: ProviderId, draft: ProviderDraft): AppSettings {
    const statement = this.database.prepare(upsertSettingStatement)

    statement.run({
      key: settingsKeys[provider],
      value: JSON.stringify({
        apiKey: draft.apiKey.trim(),
        model: draft.model.trim()
      }),
      updatedAt: new Date().toISOString()
    })

    return this.getSettings()
  }

  private readJson<T>(key: string): T | null {
    const row = this.database
      .prepare(`SELECT value FROM ${tableNames.settings} WHERE key = ?`)
      .get(key) as SettingRow | undefined

    if (row === undefined) {
      return null
    }

    return JSON.parse(row.value) as T
  }
}
