import { Button } from '@shadcn/ui/button'
import { type SettingsSection, useSettingsStore } from '@renderer/lib/stores/settings-store'
import { useUiStore } from '@renderer/lib/stores/ui-store'

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'projects', label: 'Projects' }
]

function maskApiKey(value: string): string {
  if (!value) {
    return 'Not configured'
  }

  if (value.length <= 6) {
    return '••••••'
  }

  return `${value.slice(0, 6)}••••`
}

export function SettingsDialog(): React.JSX.Element | null {
  const isOpen = useUiStore((state) => state.isSettingsDialogOpen)
  const closeDialog = useUiStore((state) => state.closeSettingsDialog)
  const activeSection = useSettingsStore((state) => state.activeSettingsSection)
  const setActiveSection = useSettingsStore((state) => state.setActiveSettingsSection)
  const claudeDraft = useSettingsStore((state) => state.providerDrafts.claude)

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="flex w-full max-w-5xl overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-900/95 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur"
      >
        <aside className="w-full max-w-64 border-r border-zinc-800 bg-zinc-950/80 p-4">
          <div className="border-b border-zinc-800 pb-4">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Workspace</p>
            <h2 className="mt-3 text-2xl font-semibold text-zinc-50">Settings</h2>
          </div>

          <div role="tablist" aria-label="Settings sections" className="mt-4 space-y-2">
            {sections.map((section) => {
              const isActive = section.id === activeSection

              return (
                <button
                  key={section.id}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`settings-panel-${section.id}`}
                  className={
                    isActive
                      ? 'flex w-full items-center justify-between rounded-2xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-left text-sm font-medium text-zinc-50'
                      : 'flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-3 text-left text-sm font-medium text-zinc-400 transition hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                  }
                  onClick={() => setActiveSection(section.id)}
                >
                  <span>{section.label}</span>
                  <span
                    aria-hidden="true"
                    className="text-xs uppercase tracking-[0.2em] text-zinc-500"
                  >
                    Open
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="flex min-h-[560px] flex-1 flex-col p-6">
          <div className="flex items-start justify-between gap-6 border-b border-zinc-800 pb-5">
            <div>
              <h3 className="text-xl font-semibold text-zinc-50">
                {sections.find((section) => section.id === activeSection)?.label}
              </h3>
              <p className="mt-2 text-sm text-zinc-400">
                Tune how Moon behaves before wiring persistence.
              </p>
            </div>
            <Button variant="secondary" onClick={closeDialog} aria-label="Close Settings">
              Close
            </Button>
          </div>

          <div className="mt-6 flex-1">
            <section
              id="settings-panel-general"
              role="tabpanel"
              hidden={activeSection !== 'general'}
              className="space-y-4"
            >
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                <p className="text-sm font-medium text-zinc-100">General</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Control startup behavior, onboarding defaults, and shell-level ergonomics later.
                </p>
              </div>
            </section>

            <section
              id="settings-panel-providers"
              role="tabpanel"
              hidden={activeSection !== 'providers'}
              className="space-y-4"
            >
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Claude</p>
                    <p className="mt-2 text-sm text-zinc-400">
                      API key saved for this session only.
                    </p>
                  </div>
                  <div className="text-right text-sm text-zinc-400">
                    <p>{claudeDraft.model || 'No model selected'}</p>
                    <p className="mt-2 font-mono text-xs text-zinc-500">
                      {maskApiKey(claudeDraft.apiKey)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section
              id="settings-panel-appearance"
              role="tabpanel"
              hidden={activeSection !== 'appearance'}
              className="space-y-4"
            >
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                <p className="text-sm font-medium text-zinc-100">Appearance</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Keep the Alma-like shell aesthetic while exposing future density and chrome
                  toggles.
                </p>
              </div>
            </section>

            <section
              id="settings-panel-projects"
              role="tabpanel"
              hidden={activeSection !== 'projects'}
              className="space-y-4"
            >
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                <p className="text-sm font-medium text-zinc-100">Projects</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Reserve this space for workspace defaults, indexing, and repository-level
                  controls.
                </p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  )
}
