import { RouterProvider } from '@tanstack/react-router'

import { AppProviders } from './app/providers'
import { useAppRouterContext } from './app/router/router-context'
import { appRouter } from './app/router'

function RouterHost(): React.JSX.Element {
  const context = useAppRouterContext()
  return <RouterProvider router={appRouter} context={context} />
}

function App(): React.JSX.Element {
  return (
    <AppProviders>
      <RouterHost />
    </AppProviders>
  )
}

export default App
