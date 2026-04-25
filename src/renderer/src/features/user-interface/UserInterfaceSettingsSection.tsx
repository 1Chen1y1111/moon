import {
  saveAppearanceSettings,
  selectAppSettings,
  selectSettingsSaveStatus,
  useSettingsDispatch,
  useSettingsSelector
} from '@renderer/entities/settings'
import { settingsPanelClassName } from '@renderer/shared/ui/settings-panel'
import type { AppearanceTheme } from '@shared/domain/settings'

import DarkAppearance from './appearance/DarkAppearance'
import LightAppearance from './appearance/LightAppearance'
import SystemAppearance from './appearance/SystemAppearance'

const themeOptions = [
  {
    theme: 'light',
    label: '浅色',
    Preview: LightAppearance
  },
  {
    theme: 'dark',
    label: '深色',
    Preview: DarkAppearance
  },
  {
    theme: 'system',
    label: '跟随系统',
    Preview: SystemAppearance
  }
] as const satisfies Array<{
  theme: AppearanceTheme
  label: string
  Preview: () => React.JSX.Element
}>

export function UserInterfaceSettingsSection(): React.JSX.Element {
  const dispatch = useSettingsDispatch()
  const appSettings = useSettingsSelector(selectAppSettings)
  const saveStatus = useSettingsSelector(selectSettingsSaveStatus)
  const activeTheme = appSettings.appearance.theme
  const isSaving = saveStatus === 'saving'

  function handleThemeChange(theme: AppearanceTheme): void {
    if (theme === activeTheme) {
      return
    }

    void dispatch(saveAppearanceSettings({ theme }))
  }

  return (
    <section className={settingsPanelClassName}>
      <h2 className="font-moon-serif text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
        用户界面
      </h2>

      <div className="mt-moon-section-gap">
        <p className="text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
          主题
        </p>
        <div className="mt-moon-option-stack grid gap-moon-option-gap md:grid-cols-3">
          {themeOptions.map(({ theme, label, Preview }) => {
            const isActive = theme === activeTheme

            return (
              <button
                key={theme}
                type="button"
                aria-pressed={isActive}
                className={
                  isActive
                    ? 'flex flex-col items-center rounded-moon-control border border-moon-button-secondary-border p-moon-option-gap text-moon-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent'
                    : 'flex flex-col items-center rounded-moon-control border border-moon-button-secondary-border p-moon-option-gap text-moon-text-primary transition-colors hover:border-moon-menu-item-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent'
                }
                disabled={isSaving}
                onClick={() => handleThemeChange(theme)}
              >
                <Preview />
                <span className="text-center text-moon-caption leading-moon-caption">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
