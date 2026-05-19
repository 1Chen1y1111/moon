export function UserMessage({ content }: { content: string }): React.JSX.Element | null {
  if (content.length === 0) {
    return null
  }

  return <div className="whitespace-pre-wrap break-words">{content}</div>
}
