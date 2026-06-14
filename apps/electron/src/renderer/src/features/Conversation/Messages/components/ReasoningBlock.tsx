import { Reasoning, ReasoningContent, ReasoningTrigger } from '@moon/ui/ai-elements/reasoning'

export function ReasoningBlock({
  isStreaming,
  reasoning
}: {
  isStreaming: boolean
  reasoning?: string
}): React.JSX.Element | null {
  if (reasoning === undefined || reasoning.trim().length === 0) {
    return null
  }

  return (
    <Reasoning
      className="mb-2 rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-xs leading-5"
      defaultOpen
      isStreaming={isStreaming}
    >
      <ReasoningTrigger
        className="text-xs font-medium"
        getThinkingMessage={(streaming) => (streaming ? '推理中...' : '推理')}
      />
      <ReasoningContent className="mt-1 text-xs leading-5">{reasoning}</ReasoningContent>
    </Reasoning>
  )
}
