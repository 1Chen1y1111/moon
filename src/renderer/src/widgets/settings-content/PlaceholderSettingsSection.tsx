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
      <p className="font-serif text-xl font-medium leading-7 text-foreground">{section?.title}</p>
      <p className="mt-10 text-sm leading-6 text-muted-foreground">
        {section?.description ?? '该设置分类尚未配置描述。'}
      </p>
      <div className="mt-16 rounded-lg border border-dashed border-border bg-card px-6 py-6 text-sm leading-6 text-muted-foreground">
        页面内容待补齐
      </div>
    </section>
  )
}
