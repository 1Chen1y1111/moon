const SystemAppearance = (): React.JSX.Element => {
  return (
    <svg
      aria-hidden="true"
      data-testid="appearance-preview-system"
      focusable="false"
      viewBox="0 0 120 80"
      className="mb-moon-md block h-auto w-full rounded-moon-control"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="system-appearance-left-half">
          <rect x="0" y="0" width="60" height="80" />
        </clipPath>
        <clipPath id="system-appearance-right-half">
          <rect x="60" y="0" width="60" height="80" />
        </clipPath>
      </defs>
      <g clipPath="url(#system-appearance-left-half)">
        <rect width="120" height="80" fill="#F8F9FB" />
        <rect x="0" y="0" width="30" height="80" fill="#EBEDF0" />
        <rect x="4" y="8" width="22" height="4" rx="2" fill="#C8CBD0" />
        <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#D5D7DB" />
        <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#D5D7DB" />
        <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#D5D7DB" />
        <rect x="36" y="8" width="78" height="64" rx="4" fill="#FFFFFF" />
        <rect x="42" y="16" width="50" height="4" rx="2" fill="#D5D7DB" />
        <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#E2E4E7" />
        <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#E2E4E7" />
        <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#E2E4E7" />
        <rect x="42" y="46" width="40" height="4" rx="2" fill="#D5D7DB" />
        <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#E2E4E7" />
      </g>
      <g clipPath="url(#system-appearance-right-half)">
        <rect width="120" height="80" fill="#0F1117" />
        <rect x="0" y="0" width="30" height="80" fill="#151820" />
        <rect x="4" y="8" width="22" height="4" rx="2" fill="#3A3F4B" />
        <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#2A2F3A" />
        <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#2A2F3A" />
        <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#2A2F3A" />
        <rect x="36" y="8" width="78" height="64" rx="4" fill="#1A1D27" />
        <rect x="42" y="16" width="50" height="4" rx="2" fill="#3A3F4B" />
        <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#252930" />
        <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#252930" />
        <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#252930" />
        <rect x="42" y="46" width="40" height="4" rx="2" fill="#3A3F4B" />
        <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#252930" />
      </g>
      <line x1="60" y1="0" x2="60" y2="80" stroke="#888" strokeWidth="0.5" />
    </svg>
  )
}

export default SystemAppearance
