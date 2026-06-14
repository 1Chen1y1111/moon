import { MessageSquareText } from 'lucide-react'

export function InboxWelcome(): React.JSX.Element {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
          <MessageSquareText aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-foreground">准备开始聊天</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            从左侧选择最近会话，或直接输入第一条消息。
          </p>
        </div>
      </div>
    </div>
  )
}
