// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@main/db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from '@main/db/connection'
import { SettingsRepository } from '@main/repositories/settings-repository'

const pgliteTestTimeout = 30_000

async function createBootstrappedConnection(databasePath: string): Promise<AppDatabaseConnection> {
  const connection = await createDatabaseConnection(databasePath)

  await bootstrapDatabase(connection)

  return connection
}

describe('SettingsRepository', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it(
    'persists provider settings across PGlite connections and returns stored keys',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const firstConnection = await createBootstrappedConnection(databasePath)
      const firstRepository = new SettingsRepository(firstConnection)

      expect((await firstRepository.getSettings()).providers.claude).toMatchObject({
        provider: 'claude',
        hasApiKey: false,
        model: '',
        baseUrl: '',
        updatedAt: ''
      })

      await firstRepository.saveProvider('claude', {
        apiKey: 'sk-ant-demo',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: '',
        models: [
          {
            id: 'claude-3-7-sonnet-latest',
            name: 'claude-3-7-sonnet-latest',
            enabled: true,
            isManual: true,
            supportsVision: true,
            supportsImageOutput: false,
            supportsToolCalling: true,
            supportsReasoning: true,
            supportsEmbedding: false,
            contextWindow: 200_000,
            maxOutputTokens: 8192,
            providerOptions: '{\n\n}',
            manualOverrides: ['supportsReasoning', 'contextWindow']
          }
        ],
        availableModels: []
      })

      expect(await firstRepository.getStoredProviderKey('claude')).toBe('sk-ant-demo')

      await firstConnection.close()

      const secondConnection = await createBootstrappedConnection(databasePath)
      const secondRepository = new SettingsRepository(secondConnection)
      const persistedSettings = await secondRepository.getSettings()

      expect(persistedSettings.providers.claude).toMatchObject({
        provider: 'claude',
        hasApiKey: true,
        apiKey: 'sk-ant-demo',
        model: 'claude-3-7-sonnet-latest',
        models: [
          {
            id: 'claude-3-7-sonnet-latest',
            name: 'claude-3-7-sonnet-latest',
            enabled: true,
            isManual: true,
            supportsVision: true,
            supportsImageOutput: false,
            supportsToolCalling: true,
            supportsReasoning: true,
            supportsEmbedding: false,
            contextWindow: 200_000,
            maxOutputTokens: 8192,
            providerOptions: '{\n\n}',
            manualOverrides: ['supportsReasoning', 'contextWindow']
          }
        ],
        baseUrl: ''
      })
      expect(persistedSettings.providers.claude.updatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      )
      await secondConnection.close()
    },
    pgliteTestTimeout
  )

  it(
    'keeps the stored provider key when saving provider metadata without a new key',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const repository = new SettingsRepository(connection)

      await repository.saveProvider('openai', {
        apiKey: 'sk-openai-demo',
        model: 'gpt-5.4',
        baseUrl: ''
      })

      await repository.saveProvider('openai', {
        apiKey: '',
        model: 'gpt-5.4-mini',
        baseUrl: ''
      })

      const settings = await repository.getSettings()

      expect(await repository.getStoredProviderKey('openai')).toBe('sk-openai-demo')
      expect(settings.providers.openai).toMatchObject({
        hasApiKey: true,
        apiKey: 'sk-openai-demo',
        model: 'gpt-5.4-mini'
      })

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'does not surface unfetched built-in default models',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const repository = new SettingsRepository(connection)

      await repository.saveProvider('openai', {
        apiKey: 'sk-openai-demo',
        model: 'custom-model',
        baseUrl: '',
        models: [
          {
            id: 'gpt-5.4',
            name: 'gpt-5.4',
            enabled: true,
            isManual: false
          },
          {
            id: 'custom-model',
            name: 'custom-model',
            enabled: true,
            isManual: true
          }
        ],
        availableModels: [
          {
            id: 'gpt-5.2',
            name: 'gpt-5.2',
            enabled: false,
            isManual: false
          },
          {
            id: 'custom-model',
            name: 'custom-model',
            enabled: true,
            isManual: true
          }
        ]
      })

      const settings = await repository.getSettings()

      expect(settings.providers.openai.models).toEqual([
        {
          id: 'custom-model',
          name: 'custom-model',
          enabled: true,
          isManual: true
        }
      ])
      expect(settings.providers.openai.availableModels).toEqual([
        {
          id: 'custom-model',
          name: 'custom-model',
          enabled: true,
          isManual: true
        }
      ])

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'persists newly supported fixed providers',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const repository = new SettingsRepository(connection)

      await repository.saveProvider('deepseek', {
        apiKey: 'sk-deepseek-demo',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1'
      })

      const settings = await repository.getSettings()

      expect(settings.providers.deepseek).toMatchObject({
        provider: 'deepseek',
        hasApiKey: true,
        apiKey: 'sk-deepseek-demo',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1'
      })

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'persists appearance theme across PGlite connections',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const firstConnection = await createBootstrappedConnection(databasePath)
      const firstRepository = new SettingsRepository(firstConnection)

      expect((await firstRepository.getSettings()).appearance.theme).toBe('system')

      await firstRepository.saveAppearance({ theme: 'dark' })

      expect((await firstRepository.getSettings()).appearance.theme).toBe('dark')

      await firstConnection.close()

      const secondConnection = await createBootstrappedConnection(databasePath)
      const secondRepository = new SettingsRepository(secondConnection)

      expect((await secondRepository.getSettings()).appearance.theme).toBe('dark')

      await secondConnection.close()
    },
    pgliteTestTimeout
  )
})
