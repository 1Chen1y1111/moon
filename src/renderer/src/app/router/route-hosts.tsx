import { Outlet } from '@tanstack/react-router'

import { ChatPage } from '@renderer/pages/chat/ChatPage'
import { HomePage } from '@renderer/pages/home/HomePage'
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
