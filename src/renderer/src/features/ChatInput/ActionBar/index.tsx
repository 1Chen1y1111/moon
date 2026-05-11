import { Fragment } from 'react'

import { cn } from '@shadcn/lib/utils'

import { actionMap, defaultActionKeys, type ActionKey, type ActionKeys } from './config'
import { ActionBarContext, type ActionBarContextValue } from './context'

export interface ActionBarProps {
  actions?: ActionKeys[]
  className?: string
  context?: ActionBarContextValue
}

function renderAction(key: ActionKey): React.JSX.Element {
  const Render = actionMap[key]

  return <Render key={key} />
}

function renderActionItem(action: ActionKeys, index: number): React.JSX.Element {
  if (action === '---') {
    return (
      <div key={`divider-${index}`} role="separator" className="mx-1 h-4 w-px shrink-0 bg-border" />
    )
  }

  if (Array.isArray(action)) {
    return (
      <div key={`group-${index}`} className="flex items-center gap-1">
        {action.map((key) => (
          <Fragment key={key}>{renderAction(key)}</Fragment>
        ))}
      </div>
    )
  }

  return renderAction(action)
}

export function ActionBar({
  actions = defaultActionKeys,
  className,
  context
}: ActionBarProps): React.JSX.Element {
  return (
    <ActionBarContext.Provider value={context ?? {}}>
      <div className={cn('flex min-w-0 items-center gap-1 overflow-hidden', className)}>
        {actions.map((action, index) => renderActionItem(action, index))}
      </div>
    </ActionBarContext.Provider>
  )
}
