import { describe, expect, it } from 'vitest'

import { setActiveSettingsSection, settingsReducer } from '@renderer/entities/settings/model/slices'

describe('settingsSlice', () => {
  it('defaults to the general section', () => {
    const state = settingsReducer(undefined, { type: 'unknown' })

    expect(state.activeSection).toBe('general')
  })

  it('switches the active settings section', () => {
    const nextState = settingsReducer(undefined, setActiveSettingsSection('about'))

    expect(nextState.activeSection).toBe('about')
  })
})
