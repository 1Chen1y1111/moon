const LightAppearance = (): React.JSX.Element => {
  return (
    <svg
      aria-hidden="true"
      data-testid="appearance-preview-light"
      focusable="false"
      viewBox="0 0 120 80"
      className="light mb-3 block h-auto w-full rounded-md"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="120" height="80" fill="var(--background)" />
      <rect x="0" y="0" width="30" height="80" fill="var(--sidebar)" />
      <rect x="4" y="8" width="22" height="4" rx="2" fill="var(--muted-foreground)" />
      <rect x="4" y="16" width="18" height="3" rx="1.5" fill="var(--muted)" />
      <rect x="4" y="22" width="20" height="3" rx="1.5" fill="var(--muted)" />
      <rect x="4" y="28" width="16" height="3" rx="1.5" fill="var(--muted)" />
      <rect
        x="36"
        y="8"
        width="78"
        height="64"
        rx="4"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="0.5"
      />
      <rect x="42" y="16" width="50" height="4" rx="2" fill="var(--muted-foreground)" />
      <rect x="42" y="24" width="66" height="3" rx="1.5" fill="var(--muted)" />
      <rect x="42" y="30" width="60" height="3" rx="1.5" fill="var(--muted)" />
      <rect x="42" y="36" width="55" height="3" rx="1.5" fill="var(--muted)" />
      <rect x="42" y="46" width="40" height="4" rx="2" fill="var(--muted-foreground)" />
      <rect x="42" y="54" width="66" height="3" rx="1.5" fill="var(--muted)" />
      <rect x="42" y="60" width="58" height="3" rx="1.5" fill="var(--muted)" />
    </svg>
  )
}

export default LightAppearance
