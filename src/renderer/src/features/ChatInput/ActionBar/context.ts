import { createContext, useContext } from 'react'

export type DropdownPlacement =
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight'
  | 'top'
  | 'topLeft'
  | 'topRight'

export interface ActionBarContextValue {
  actionSize?: {
    blockSize: number
    size: number
  }
  borderRadius?: number
  dropdownPlacement?: DropdownPlacement
}

export const ActionBarContext = createContext<ActionBarContextValue>({})

export function useActionBarContext(): ActionBarContextValue {
  return useContext(ActionBarContext)
}
