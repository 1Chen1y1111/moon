import { Outlet } from '@tanstack/react-router'

import { AppShell } from '@renderer/app-shell/AppShell'
import { HomeEmptyState } from '@renderer/features/home/HomeEmptyState'

export function RootLayout(): React.JSX.Element {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export function HomeRoute(): React.JSX.Element {
  return <HomeEmptyState />
}

export function ChatRoute(): React.JSX.Element {
  return (
    <section className="flex min-h-full items-center justify-center p-6 text-sm text-zinc-400">
      Chat View
    </section>
  )
}
