import type { ProviderModel, ProviderModelManualOverride } from '@shared/domain/provider'

type AutoModelCapability = Extract<
  ProviderModelManualOverride,
  'supportsVision' | 'supportsToolCalling' | 'supportsReasoning'
>

export function formatContextWindow(model: ProviderModel): string {
  if (model.contextWindow === undefined) {
    return ''
  }

  if (model.contextWindow >= 1_000_000) {
    const contextWindowInMillions = model.contextWindow / 1_000_000
    const displayValue = Number.isInteger(contextWindowInMillions)
      ? String(contextWindowInMillions)
      : String(Number(contextWindowInMillions.toFixed(1)))

    return `${displayValue}M`
  }

  if (model.contextWindow >= 1000) {
    return `${Math.round(model.contextWindow / 1000)}K`
  }

  return String(model.contextWindow)
}

function hasModelManualOverride(model: ProviderModel, field: ProviderModelManualOverride): boolean {
  return model.manualOverrides?.includes(field) ?? false
}

export function resolveAutoModelCapability(
  model: ProviderModel,
  field: AutoModelCapability
): boolean {
  return hasModelManualOverride(model, field) ? (model[field] ?? false) : true
}
