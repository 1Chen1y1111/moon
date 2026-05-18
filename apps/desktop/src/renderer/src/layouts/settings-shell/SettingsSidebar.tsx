import { settingsSections, type SettingsSectionId } from '@renderer/entities/settings'

import { ScrollArea } from '@moon/ui/ui/scroll-area'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@moon/ui/ui/sidebar'

type SettingsSidebarProps = {
  activeSection: SettingsSectionId
  headerSlot: React.ReactNode
  onSectionChange: (sectionId: SettingsSectionId) => void
}

export function SettingsSidebar({
  activeSection,
  headerSlot,
  onSectionChange
}: SettingsSidebarProps): React.JSX.Element {
  return (
    <aside data-testid="settings-sidebar-shell" className="relative z-30 flex w-56 shrink-0 p-3">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-visible rounded-xl border border-border bg-card">
        <div className="[-webkit-app-region:drag] select-none flex items-center justify-between border-b border-border p-3">
          {headerSlot}
        </div>

        <SidebarProvider defaultOpen className="min-h-0 flex-1">
          <ScrollArea className="min-h-0 flex-1 p-3">
            <SidebarMenu role="tablist" aria-label="设置分类" className="gap-1.5">
              {settingsSections.map((section) => {
                const isActive = section.id === activeSection
                const Icon = section.icon

                return (
                  <SidebarMenuItem key={section.id} role="presentation">
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      size="lg"
                      className={
                        isActive
                          ? '[-webkit-app-region:no-drag] relative z-20 h-10 gap-3 border border-input bg-secondary px-3 py-3 text-left text-sm font-medium leading-6 text-foreground data-active:bg-secondary data-active:text-foreground'
                          : '[-webkit-app-region:no-drag] relative z-20 h-10 gap-3 border border-transparent px-3 py-3 text-left text-sm font-medium leading-6 text-foreground transition-colors hover:bg-accent hover:text-foreground'
                      }
                    >
                      <div
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onSectionChange(section.id)}
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span>{section.label}</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </ScrollArea>
        </SidebarProvider>
      </div>
    </aside>
  )
}
