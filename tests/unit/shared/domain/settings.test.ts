import { describe, expect, it } from 'vitest'

import { createDefaultProviderSettings } from '@shared/domain/settings'

describe('createDefaultProviderSettings', () => {
  it('uses a Custom badge for custom providers', () => {
    expect(createDefaultProviderSettings('custom:my-api')).toMatchObject({
      provider: 'custom:my-api',
      badge: 'Custom',
      isCustom: true
    })
  })

  it('does not add a Custom badge to built-in providers', () => {
    expect(createDefaultProviderSettings('openai')).toMatchObject({
      provider: 'openai',
      badge: '',
      isCustom: false
    })
  })
})
