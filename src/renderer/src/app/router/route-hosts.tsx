import { ChatPage } from '@renderer/pages/chat'
import { HomePage } from '@renderer/pages/home'
import { SettingsPage } from '@renderer/pages/settings'
import { WorkspaceShell } from '@renderer/layouts/workspace-shell'

export function WorkspaceLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <WorkspaceShell>{children}</WorkspaceShell>
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
  return <SettingsPage />
}
