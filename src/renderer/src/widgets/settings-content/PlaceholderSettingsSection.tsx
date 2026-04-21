import type { SettingsSection } from '@renderer/entities/settings'
import { settingsPanelClassName } from '@renderer/shared/ui/settings-panel'

type PlaceholderSettingsSectionProps = {
  section: SettingsSection | undefined
}

export function PlaceholderSettingsSection({
  section
}: PlaceholderSettingsSectionProps): React.JSX.Element {
  return (
    <section className={settingsPanelClassName}>
      <p className="text-[2rem] font-medium tracking-tight text-moon-text-primary">
        {section?.title}
      </p>
      <p className="mt-6 text-sm leading-7 text-moon-text-secondary">
        {section?.description ?? '该设置分类尚未配置描述。'}
      </p>
      <div className="mt-8 rounded-2xl border border-dashed border-moon-panel-border bg-moon-sidebar-bg px-4 py-6 text-sm text-moon-text-secondary">
        页面内容待补齐
      </div>
    </section>
  )
}
