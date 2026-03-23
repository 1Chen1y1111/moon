import { describe, expect, it } from 'vitest'

import {
  closeSettingsDialog,
  openSettingsDialog,
  setActiveSettingsSection,
  settingsReducer
} from './index'

describe('settingsSlice', () => {
  it('opens and closes the settings dialog', () => {
    const openedState = settingsReducer(undefined, openSettingsDialog())
    const closedState = settingsReducer(openedState, closeSettingsDialog())

    expect(openedState.isOpen).toBe(true)
    expect(closedState.isOpen).toBe(false)
  })

  it('switches the active settings section', () => {
    const nextState = settingsReducer(undefined, setActiveSettingsSection('providers'))

    expect(nextState.activeSection).toBe('providers')
  })
})
