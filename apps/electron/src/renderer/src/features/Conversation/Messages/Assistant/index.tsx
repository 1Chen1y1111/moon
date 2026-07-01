/**
 * 负责渲染 assistant 消息正文，边界止于 markdown/富文本响应展示。
 * 消息状态、reasoning 和工具卡由外层 MessageBubble 组合。
 */

import { MessageResponse } from '@moon/ui/ai-elements/message'

/**
 * 渲染 assistant 的 markdown 内容，并在最终内容替换时刷新 Streamdown 状态。
 */
export function AssistantMessage({ content }: { content: string }): React.JSX.Element | null {
  if (content.length === 0) {
    return null
  }

  return (
    <MessageResponse key={content} className="break-words">
      {content}
    </MessageResponse>
  )
}
