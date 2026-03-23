import { Minus, Square, X } from 'lucide-react'

import { useAppDispatch, useAppSelector } from '@renderer/app/store/hooks'

import { settingsSections } from '../config/settings-sections'
import { selectActiveSettingsSection } from '../model/settings.selectors'
import { setActiveSettingsSection } from '../model/slices'
import { SettingsContent } from './SettingsContent'
import { SettingsSidebar } from './SettingsSidebar'

export function SettingsShellContent(): React.JSX.Element {
  const dispatch = useAppDispatch()
  const activeSection = useAppSelector(selectActiveSettingsSection)
  const activeMeta = settingsSections.find((section) => section.id === activeSection)

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden rounded-2xl border border-[#3a414f] bg-[#2b313c] text-[#eef2f7] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={(sectionId) => dispatch(setActiveSettingsSection(sectionId))}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#3a414f] px-6">
          <h1 className="text-[2rem] font-semibold tracking-tight text-white">
            {activeMeta?.title ?? '设置'}
          </h1>

          <div className="flex items-center gap-1 text-[#aeb7c5]">
            <button
              type="button"
              aria-label="最小化设置"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#363d49]"
            >
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="最大化设置"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#363d49]"
            >
              <Square aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="关闭设置窗口"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#4a3136] hover:text-white"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div
          data-testid="settings-content-scroll"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          <SettingsContent activeSection={activeSection} />
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-[#3a414f] px-6 py-4">
          <p className="text-sm text-[#aeb7c5]">所有更改已保存</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-10 rounded-xl border border-[#50596b] bg-[#323a47] px-5 text-sm text-[#eef2f7] hover:bg-[#3a4350]"
            >
              关闭
            </button>
            <button
              type="button"
              className="h-10 rounded-xl bg-[#4e7aa5] px-5 text-sm font-medium text-white hover:bg-[#5d89b4]"
            >
              保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
