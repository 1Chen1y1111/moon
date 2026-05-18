import { Label } from '@moon/ui/ui/label'

export function FieldLabel({
  children,
  htmlFor
}: {
  children: React.ReactNode
  htmlFor?: string
}): React.JSX.Element {
  return (
    <Label htmlFor={htmlFor} className="block text-sm  leading-6 text-foreground">
      {children}
    </Label>
  )
}

export function FieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{children}</span>
}
