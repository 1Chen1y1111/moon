import { Outlet } from '@tanstack/react-router'

import { ChatPage } from '@renderer/pages/chat/ChatPage'
import { HomePage } from '@renderer/pages/home/HomePage'
import { SettingsPage } from '@renderer/pages/settings/SettingsPage'
import { AppShell } from '@renderer/shell/AppShell'

export function RootLayout(): React.JSX.Element {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export function HomeRoute(): React.JSX.Element {
  return <HomePage />
}

export function ChatRoute(): React.JSX.Element {
  return <ChatPage />
}

export function SettingsRoute(): React.JSX.Element {
  return <SettingsPage />
}
