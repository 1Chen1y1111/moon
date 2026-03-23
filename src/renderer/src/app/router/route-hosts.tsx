import { ChatPage } from '@renderer/pages/chat/ChatPage'
import { HomePage } from '@renderer/pages/home/HomePage'
import { SettingsPage } from '@renderer/pages/settings/SettingsPage'
import { AppShell } from '@renderer/shell/AppShell'
import { SettingsShell } from '@renderer/shell/SettingsShell'

export function WorkspaceLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <AppShell>{children}</AppShell>
}

export function SettingsLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <SettingsShell>{children}</SettingsShell>
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
