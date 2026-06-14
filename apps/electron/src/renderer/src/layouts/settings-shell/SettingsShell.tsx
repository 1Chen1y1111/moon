import type { SettingsSectionId } from '@renderer/entities/settings'
import { MacWindowControls } from '@renderer/components/WindowControls'

import { Button } from '@moon/ui/ui/button'
import { ScrollArea } from '@moon/ui/ui/scroll-area'

import { SettingsChrome } from './SettingsChrome'
import { SettingsSidebar } from './SettingsSidebar'

type SettingsShellProps = {
  activeSection: SettingsSectionId
  title: string
  footerStatusText: string
  footerSaveDisabled: boolean
  footerSaveLabel: string
  children: React.ReactNode
  onFooterSave: () => void
  onSectionChange: (sectionId: SettingsSectionId) => void
}

function SettingsSidebarWindowControls(): React.JSX.Element {
  const handleClose = (): void => {
    void window.api.windowControls.close()
  }

  const handleMinimize = (): void => {
    void window.api.windowControls.minimize()
  }

  const handleToggleMaximize = (): void => {
    void window.api.windowControls.toggleMaximize()
  }

  return (
    <MacWindowControls
      onClose={handleClose}
      onMinimize={handleMinimize}
      onToggleMaximize={handleToggleMaximize}
    />
  )
}

export function SettingsShell({
  activeSection,
  title,
  footerStatusText,
  footerSaveDisabled,
  footerSaveLabel,
  children,
  onFooterSave,
  onSectionChange
}: SettingsShellProps): React.JSX.Element {
  const handleFooterClose = (): void => {
    void window.api.windowControls.close()
  }
  const contentClassName = 'h-[calc(100%-120px)] flex-1 px-6 py-6'

  return (
    <div
      data-testid="settings-shell"
      className="flex w-full h-screen bg-background text-foreground"
    >
      <SettingsSidebar
        activeSection={activeSection}
        headerSlot={<SettingsSidebarWindowControls />}
        onSectionChange={onSectionChange}
      />

      <main className="w-full h-screen flex flex-1 flex-col">
        <SettingsChrome title={title} />

        {activeSection === 'providers' ? (
          <div data-testid="settings-content" className={contentClassName}>
            {children}
          </div>
        ) : (
          <ScrollArea data-testid="settings-content-scroll" className={contentClassName}>
            {children}
          </ScrollArea>
        )}

        <footer className="flex shrink-0 items-center justify-between border-t border-border px-6 h-16">
          <p className="text-sm leading-6 text-muted-foreground">{footerStatusText}</p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleFooterClose}>
              关闭
            </Button>
            <Button variant="secondary" disabled={footerSaveDisabled} onClick={onFooterSave}>
              {footerSaveLabel}
            </Button>
          </div>
        </footer>
      </main>
    </div>
  )
}
