import { describe, expect, it } from 'vitest'

import { resetSettingsStore, useSettingsStore } from '@renderer/store/settings'

describe('settings store', () => {
  it('defaults to the general section', () => {
    resetSettingsStore()

    expect(useSettingsStore.getState().activeSection).toBe('general')
  })

  it('switches the active settings section', () => {
    resetSettingsStore()

    useSettingsStore.getState().setActiveSettingsSection('about')

    expect(useSettingsStore.getState().activeSection).toBe('about')
  })
})
