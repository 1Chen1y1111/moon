import { ChatPage } from '@renderer/pages/chat'
import { HomePage } from '@renderer/pages/home'
import { SettingsPage } from '@renderer/pages/settings'
import { SettingsWindowShell } from '@renderer/widgets/settings-window-shell'
import { WorkspaceShell } from '@renderer/widgets/workspace-shell'

export function WorkspaceLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <WorkspaceShell>{children}</WorkspaceShell>
}

export function SettingsLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <SettingsWindowShell>{children}</SettingsWindowShell>
}

export function HomeRoute(): React.JSX.Element {
  return (
    <WorkspaceLayout>
      <HomePage />
    </WorkspaceLayout>
  )
}

export function ChatRoute(): React.JSX.Element {
  return (
    <WorkspaceLayout>
      <ChatPage />
    </WorkspaceLayout>
  )
}

export function SettingsRoute(): React.JSX.Element {
  return (
    <SettingsLayout>
      <SettingsPage />
    </SettingsLayout>
  )
}
