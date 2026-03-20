// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '../db/bootstrap'
import { createDatabaseConnection } from '../db/connection'
import { SettingsRepository } from './settings-repository'

describe('SettingsRepository', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it('persists claude provider settings across database connections', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-settings-repository-'))
    const databasePath = join(directoryPath, 'moon.sqlite')
    tempDirectories.push(directoryPath)

    const firstConnection = createDatabaseConnection(databasePath)
    bootstrapDatabase(firstConnection)

    const firstRepository = new SettingsRepository(firstConnection)

    expect(firstRepository.getSettings()).toEqual({
      providerDrafts: {
        claude: {
          apiKey: '',
          model: ''
        }
      }
    })

    firstRepository.saveProviderDraft('claude', {
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest'
    })

    firstConnection.close()

    const secondConnection = createDatabaseConnection(databasePath)
    bootstrapDatabase(secondConnection)

    const secondRepository = new SettingsRepository(secondConnection)

    expect(secondRepository.getSettings()).toEqual({
      providerDrafts: {
        claude: {
          apiKey: 'sk-ant-demo',
          model: 'claude-3-7-sonnet-latest'
        }
      }
    })

    secondConnection.close()
  })
})
