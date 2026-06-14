import { MessageResponse } from '@moon/ui/ai-elements/message'

export function AssistantMessage({ content }: { content: string }): React.JSX.Element | null {
  if (content.length === 0) {
    return null
  }

  return <MessageResponse className="break-words">{content}</MessageResponse>
}
