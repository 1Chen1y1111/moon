export default function SkeletonList(): React.JSX.Element {
  return (
    <div
      aria-label="加载聊天消息"
      className="flex min-h-full flex-col gap-8 px-6 py-6"
      role="status"
    >
      <div className="ml-auto flex w-full max-w-xl flex-col items-end gap-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
      </div>

      <div className="flex w-full max-w-3xl gap-3">
        <div className="size-7 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-2 flex gap-2">
            <div className="h-5 w-16 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      <div className="flex w-full max-w-3xl gap-3">
        <div className="size-7 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-10/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
