import { Outlet, createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router'

import { HomeEmptyState } from '@renderer/features/home/HomeEmptyState'
import type { AppRouterContext } from './providers'
import { AppShell } from '@renderer/app-shell/AppShell'

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRoute
})

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatRoute
})

const routeTree = rootRoute.addChildren([homeRoute, chatRoute])

export const appRouter = createRouter({
  routeTree,
  context: {
    routeState: { activeChatId: null },
    setRouteState: () => undefined
  }
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof appRouter
  }
}

function RootLayout(): React.JSX.Element {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function HomeRoute(): React.JSX.Element {
  return <HomeEmptyState />
}

function ChatRoute(): React.JSX.Element {
  return (
    <section className="flex min-h-full items-center justify-center p-6 text-sm text-zinc-400">
      Chat View
    </section>
  )
}
