// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@main/db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from '@main/db/connection'
import type { SecretCodec } from '@main/security/secret-codec'
import { SettingsRepository } from '@main/repositories/settings-repository'

const pgliteTestTimeout = 30_000

const fakeSecretCodec: SecretCodec = {
  encrypt: (plainText) => `encrypted:${Buffer.from(plainText).toString('base64')}`,
  decrypt: (encryptedText) =>
    Buffer.from(encryptedText.replace(/^encrypted:/, ''), 'base64').toString()
}

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
    'persists provider settings across PGlite connections without storing plaintext keys',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const firstConnection = await createBootstrappedConnection(databasePath)
      const firstRepository = new SettingsRepository(firstConnection, fakeSecretCodec)

      expect((await firstRepository.getSettings()).providers.claude).toEqual({
        provider: 'claude',
        hasApiKey: false,
        apiKeyPreview: '',
        model: '',
        baseUrl: '',
        updatedAt: ''
      })

      await firstRepository.saveProvider('claude', {
        apiKey: 'sk-ant-demo',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: ''
      })

      expect(await firstRepository.getEncryptedProviderKey('claude')).toBe(
        'encrypted:c2stYW50LWRlbW8='
      )
      expect(await firstRepository.getEncryptedProviderKey('claude')).not.toContain('sk-ant-demo')

      await firstConnection.close()

      const secondConnection = await createBootstrappedConnection(databasePath)
      const secondRepository = new SettingsRepository(secondConnection, fakeSecretCodec)
      const persistedSettings = await secondRepository.getSettings()

      expect(persistedSettings.providers.claude).toMatchObject({
        provider: 'claude',
        hasApiKey: true,
        apiKeyPreview: '****demo',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: ''
      })
      expect(persistedSettings.providers.claude.updatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      )
      expect(persistedSettings.providers.claude).not.toHaveProperty('apiKey')

      await secondConnection.close()
    },
    pgliteTestTimeout
  )

  it(
    'keeps the encrypted provider key when saving provider metadata without a new key',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const repository = new SettingsRepository(connection, fakeSecretCodec)

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

      expect(await repository.getEncryptedProviderKey('openai')).toBe(
        'encrypted:c2stb3BlbmFpLWRlbW8='
      )
      expect(settings.providers.openai).toMatchObject({
        hasApiKey: true,
        apiKeyPreview: '****demo',
        model: 'gpt-5.4-mini'
      })

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
      const repository = new SettingsRepository(connection, fakeSecretCodec)

      await repository.saveProvider('deepseek', {
        apiKey: 'sk-deepseek-demo',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1'
      })

      const settings = await repository.getSettings()

      expect(settings.providers.deepseek).toMatchObject({
        provider: 'deepseek',
        hasApiKey: true,
        apiKeyPreview: '****demo',
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
      const firstRepository = new SettingsRepository(firstConnection, fakeSecretCodec)

      expect((await firstRepository.getSettings()).appearance.theme).toBe('system')

      await firstRepository.saveAppearance({ theme: 'dark' })

      expect((await firstRepository.getSettings()).appearance.theme).toBe('dark')

      await firstConnection.close()

      const secondConnection = await createBootstrappedConnection(databasePath)
      const secondRepository = new SettingsRepository(secondConnection, fakeSecretCodec)

      expect((await secondRepository.getSettings()).appearance.theme).toBe('dark')

      await secondConnection.close()
    },
    pgliteTestTimeout
  )

  it(
    'does not write a provider row when encryption is unavailable',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
      const databasePath = join(directoryPath, 'moon-pglite')
      tempDirectories.push(directoryPath)

      const connection = await createBootstrappedConnection(databasePath)
      const repository = new SettingsRepository(connection, {
        encrypt: () => {
          throw new Error('Secure storage is unavailable.')
        },
        decrypt: (encryptedText) => encryptedText
      })

      await expect(
        repository.saveProvider('openai', {
          apiKey: 'sk-openai-demo',
          model: 'gpt-5.4',
          baseUrl: ''
        })
      ).rejects.toThrow('Secure storage is unavailable.')
      expect(await repository.getEncryptedProviderKey('openai')).toBeNull()

      await connection.close()
    },
    pgliteTestTimeout
  )
})
