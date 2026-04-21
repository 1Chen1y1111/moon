// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@main/db/bootstrap'
import { createDatabaseConnection } from '@main/db/connection'
import type { SecretCodec } from '@main/security/secret-codec'
import { SettingsRepository } from '@main/repositories/settings-repository'

const fakeSecretCodec: SecretCodec = {
  encrypt: (plainText) => `encrypted:${Buffer.from(plainText).toString('base64')}`,
  decrypt: (encryptedText) =>
    Buffer.from(encryptedText.replace(/^encrypted:/, ''), 'base64').toString()
}

describe('SettingsRepository', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it('persists provider settings across database connections without storing plaintext keys', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
    const databasePath = join(directoryPath, 'moon.sqlite')
    tempDirectories.push(directoryPath)

    const firstConnection = createDatabaseConnection(databasePath)
    bootstrapDatabase(firstConnection)

    const firstRepository = new SettingsRepository(firstConnection, fakeSecretCodec)

    expect(firstRepository.getSettings().providers.claude).toEqual({
      provider: 'claude',
      apiKey: '',
      model: '',
      baseUrl: '',
      updatedAt: ''
    })

    firstRepository.saveProvider('claude', {
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    })

    expect(firstRepository.getEncryptedProviderKey('claude')).toBe('encrypted:c2stYW50LWRlbW8=')
    expect(firstRepository.getEncryptedProviderKey('claude')).not.toContain('sk-ant-demo')

    firstConnection.close()

    const secondConnection = createDatabaseConnection(databasePath)
    bootstrapDatabase(secondConnection)

    const secondRepository = new SettingsRepository(secondConnection, fakeSecretCodec)
    const persistedSettings = secondRepository.getSettings()

    expect(persistedSettings.providers.claude).toMatchObject({
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    })

    secondConnection.close()
  })

  it('persists appearance theme across database connections', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
    const databasePath = join(directoryPath, 'moon.sqlite')
    tempDirectories.push(directoryPath)

    const firstConnection = createDatabaseConnection(databasePath)
    bootstrapDatabase(firstConnection)

    const firstRepository = new SettingsRepository(firstConnection, fakeSecretCodec)

    expect(firstRepository.getSettings().appearance.theme).toBe('system')

    firstRepository.saveAppearance({ theme: 'dark' })

    expect(firstRepository.getSettings().appearance.theme).toBe('dark')

    firstConnection.close()

    const secondConnection = createDatabaseConnection(databasePath)
    bootstrapDatabase(secondConnection)

    const secondRepository = new SettingsRepository(secondConnection, fakeSecretCodec)

    expect(secondRepository.getSettings().appearance.theme).toBe('dark')

    secondConnection.close()
  })

  it('does not write a provider row when encryption is unavailable', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
    const databasePath = join(directoryPath, 'moon.sqlite')
    tempDirectories.push(directoryPath)

    const connection = createDatabaseConnection(databasePath)
    bootstrapDatabase(connection)

    const repository = new SettingsRepository(connection, {
      encrypt: () => {
        throw new Error('Secure storage is unavailable.')
      },
      decrypt: (encryptedText) => encryptedText
    })

    expect(() =>
      repository.saveProvider('openai', {
        apiKey: 'sk-openai-demo',
        model: 'gpt-5.4',
        baseUrl: ''
      })
    ).toThrow('Secure storage is unavailable.')
    expect(repository.getEncryptedProviderKey('openai')).toBeNull()

    connection.close()
  })
})
