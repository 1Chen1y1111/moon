import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter
} from '@tanstack/react-router'

import type { AppRouterContext } from './router-context'
import { ChatRoute, HomeRoute, SettingsRoute } from './route-hosts'

const rootRoute = createRootRouteWithContext<AppRouterContext>()({})

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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRoute
})

const routeTree = rootRoute.addChildren([homeRoute, chatRoute, settingsRoute])

export const appRouter = createRouter({
  routeTree,
  history: createHashHistory(),
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
