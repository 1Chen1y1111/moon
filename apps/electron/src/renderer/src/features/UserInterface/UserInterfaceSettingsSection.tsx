import {
  selectAppSettings,
  selectSettingsSaveStatus
} from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { settingsPanelClassName } from '@renderer/components/SettingsPanel'
import type { AppearanceTheme } from '@moon/shared/domain/settings'

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
  const appSettings = useSettingsStore(selectAppSettings)
  const saveStatus = useSettingsStore(selectSettingsSaveStatus)
  const saveAppearanceSettings = useSettingsStore((state) => state.saveAppearanceSettings)
  const activeTheme = appSettings.appearance.theme
  const isSaving = saveStatus === 'saving'

  function handleThemeChange(theme: AppearanceTheme): void {
    if (theme === activeTheme) {
      return
    }

    void saveAppearanceSettings({ theme })
  }

  return (
    <section className={settingsPanelClassName}>
      <h2 className="font-serif text-xl font-medium leading-7 text-foreground">用户界面</h2>

      <div className="mt-16">
        <p className="text-sm font-semibold leading-6 text-foreground">主题</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {themeOptions.map(({ theme, label, Preview }) => {
            const isActive = theme === activeTheme

            return (
              <button
                key={theme}
                type="button"
                aria-pressed={isActive}
                className={
                  isActive
                    ? 'flex flex-col items-center rounded-md border border-input p-3 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    : 'flex flex-col items-center rounded-md border border-input p-3 text-foreground transition-colors hover:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                }
                disabled={isSaving}
                onClick={() => handleThemeChange(theme)}
              >
                <Preview />
                <span className="text-center text-xs leading-5">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
