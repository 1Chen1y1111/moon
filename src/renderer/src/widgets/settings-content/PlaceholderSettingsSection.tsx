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
      <p className="font-moon-serif text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
        {section?.title}
      </p>
      <p className="mt-moon-xl text-moon-body leading-moon-body text-moon-text-secondary">
        {section?.description ?? '该设置分类尚未配置描述。'}
      </p>
      <div className="mt-moon-card-stack rounded-moon-card border border-dashed border-moon-panel-border bg-moon-sidebar-bg px-moon-lg py-moon-panel text-moon-body leading-moon-body text-moon-text-secondary">
        页面内容待补齐
      </div>
    </section>
  )
}
