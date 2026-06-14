import { ChatList } from './ChatList'
import type { ConversationProps } from '../types'

export default function VirtualizedList(props: ConversationProps): React.JSX.Element {
  return <ChatList {...props} />
}
