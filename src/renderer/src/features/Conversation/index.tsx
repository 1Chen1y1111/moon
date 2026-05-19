import { Suspense } from 'react'

import SkeletonList from './components/SkeletonList'
import VirtualizedList from './components/VirtualizedList'
import type { ConversationProps } from './types'

export function Conversation(props: ConversationProps): React.JSX.Element {
  return (
    <Suspense fallback={<SkeletonList />}>
      <VirtualizedList {...props} />
    </Suspense>
  )
}

export type { ConversationProps }
