# Moon Settings Window Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-app settings modal with a dedicated single-instance Electron settings window while preserving the rebuilt settings UI and aligning the renderer toward the approved `app / shell / pages / features / shared` structure.

**Architecture:** Add a dedicated settings window lifecycle in Electron main, expose an open-settings preload bridge, and load `/settings` as a separate renderer surface inside a new `SettingsShell`. Remove renderer-owned settings visibility state so the main window only triggers settings-window creation and the settings window owns the settings page UI.

**Tech Stack:** Electron, React 19, TypeScript, TanStack Router, Redux Toolkit, React Redux, shadcn/ui, Tailwind CSS, Vitest, Testing Library

---

> This plan supersedes `docs/superpowers/plans/2026-03-23-moon-settings-dialog-rebuild.md` for actual implementation work. That earlier plan remains useful as background for the settings UI internals, but the delivery target is now a dedicated settings window instead of a modal.

## File Structure Map

### New files to create

- `src/main/bootstrap/create-settings-window.ts`
- `src/main/bootstrap/create-settings-window.test.ts`
- `src/renderer/src/app/router/index.tsx`
- `src/renderer/src/app/router/route-hosts.tsx`
- `src/renderer/src/app/router/router-context.ts`
- `src/renderer/src/app/store/index.ts`
- `src/renderer/src/app/store/hooks.ts`
- `src/renderer/src/shell/AppShell.tsx`
- `src/renderer/src/shell/SettingsShell.tsx`
- `src/renderer/src/shell/LeftRail.tsx`
- `src/renderer/src/shell/LeftRail.test.tsx`
- `src/renderer/src/shell/WindowChrome.tsx`
- `src/renderer/src/shell/WindowChrome.test.tsx`
- `src/renderer/src/pages/home/HomePage.tsx`
- `src/renderer/src/pages/chat/ChatPage.tsx`
- `src/renderer/src/pages/settings/SettingsPage.tsx`
- `src/renderer/src/app/providers.test.tsx`
- `src/renderer/src/features/home/index.ts`
- `src/renderer/src/features/providers/index.ts`
- `src/renderer/src/features/providers/model/providers.types.ts`
- `src/renderer/src/features/providers/model/providers.selectors.ts`
- `src/renderer/src/features/providers/model/slices/providers.slice.ts`
- `src/renderer/src/features/providers/model/slices/index.ts`
- `src/renderer/src/features/settings/index.ts`
- `src/renderer/src/features/settings/config/settings-sections.ts`
- `src/renderer/src/features/settings/model/settings.types.ts`
- `src/renderer/src/features/settings/model/settings.selectors.ts`
- `src/renderer/src/features/settings/model/slices/settings.slice.ts`
- `src/renderer/src/features/settings/model/slices/settings.slice.test.ts`
- `src/renderer/src/features/settings/model/slices/index.ts`
- `src/renderer/src/features/settings/components/SettingsShellContent.tsx`
- `src/renderer/src/features/settings/components/SettingsSidebar.tsx`

### Existing files to modify

- `package.json`
- `pnpm-lock.yaml`
- `src/main/index.ts`
- `src/main/bootstrap/create-window.ts`
- `src/main/bootstrap/create-window.test.ts`
- `src/main/bootstrap/register-ipc.ts`
- `src/main/bootstrap/register-ipc.test.ts`
- `src/main/ipc/channels.ts`
- `src/main/ipc/contracts.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/app/providers.tsx`
- `src/renderer/src/app/router.tsx`
- `src/renderer/src/app/route-hosts.tsx`
- `src/renderer/src/app/router-context.ts`
- `src/renderer/src/app-shell/AppShell.tsx`
- `src/renderer/src/app-shell/LeftRail.tsx`
- `src/renderer/src/app-shell/LeftRail.test.tsx`
- `src/renderer/src/app-shell/WindowChrome.tsx`
- `src/renderer/src/app-shell/WindowChrome.test.tsx`
- `src/renderer/src/features/home/HomeEmptyState.tsx`
- `src/renderer/src/features/home/HomeEmptyState.test.tsx`
- `src/renderer/src/features/settings/SettingsDialog.tsx`
- `src/renderer/src/features/settings/SettingsDialog.test.tsx`
- `src/renderer/src/features/providers/ProviderSetupDialog.tsx`
- `src/renderer/src/features/providers/ProviderSetupDialog.test.tsx`
- `src/renderer/src/lib/stores/settings-store.ts`
- `src/renderer/src/lib/stores/ui-store.ts`

### Existing files expected to delete after migration

- `src/renderer/src/app/router.tsx`
- `src/renderer/src/app/route-hosts.tsx`
- `src/renderer/src/app/router-context.ts`
- `src/renderer/src/app-shell/AppShell.tsx`
- `src/renderer/src/app-shell/LeftRail.tsx`
- `src/renderer/src/app-shell/LeftRail.test.tsx`
- `src/renderer/src/app-shell/WindowChrome.tsx`
- `src/renderer/src/app-shell/WindowChrome.test.tsx`
- `src/renderer/src/lib/stores/settings-store.ts`
- `src/renderer/src/lib/stores/ui-store.ts`

## Chunk 1: Main-Process Settings Window Lifecycle

### Task 1: Add IPC contract for opening the settings window

**Files:**
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/ipc/contracts.ts`

- [ ] **Step 1: Write the failing IPC contract test**

Add or extend a test that imports the IPC contracts and asserts the new channel is present:

```ts
expect(ipcChannels.window.openSettings).toBe('window:open-settings')
```

Run: `npx vitest run src/main/bootstrap/register-ipc.test.ts`
Expected: FAIL because `openSettings` is not defined yet.

- [ ] **Step 2: Add the minimal contract**

Update `src/main/ipc/channels.ts`:

```ts
window: {
  close: 'window:close',
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  openSettings: 'window:open-settings'
}
```

Update `src/main/ipc/contracts.ts`:

```ts
[ipcChannels.window.openSettings]: {
  request: undefined
  response: void
}
```

And extend `MoonApi`:

```ts
windowControls: {
  close: () => Promise<void>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  openSettings: () => Promise<void>
}
```

- [ ] **Step 3: Run the focused test**

Run: `npx vitest run src/main/bootstrap/register-ipc.test.ts`
Expected: still FAIL, but now only because the handler is not registered yet.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/channels.ts src/main/ipc/contracts.ts
git commit -m "feat: add settings window IPC contract"
```

### Task 2: Implement a single-instance settings window factory

**Files:**
- Create: `src/main/bootstrap/create-settings-window.ts`
- Create: `src/main/bootstrap/create-settings-window.test.ts`
- Modify: `src/main/bootstrap/create-window.ts`
- Modify: `src/main/bootstrap/create-window.test.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write the failing settings-window creation test**

Create `src/main/bootstrap/create-settings-window.test.ts` with behavior like:

```ts
it('reuses the existing settings window by focusing it', async () => {
  const firstWindow = createBrowserWindowInstance()
  const secondWindow = createBrowserWindowInstance()

  browserWindowMock
    .mockImplementationOnce(() => firstWindow)
    .mockImplementationOnce(() => secondWindow)

  const { openSettingsWindow } = await import('./create-settings-window')

  openSettingsWindow()
  openSettingsWindow()

  expect(browserWindowMock).toHaveBeenCalledTimes(1)
  expect(firstWindow.focus).toHaveBeenCalledTimes(1)
})
```

Run: `npx vitest run src/main/bootstrap/create-settings-window.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 2: Add the settings-window factory**

Create a focused module-level manager:

```ts
let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({ ... })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  void loadSettingsRoute(settingsWindow)
  return settingsWindow
}
```

Use the same preload path as the main window and keep styling/platform behavior close to the main shell, but give settings its own reasonable size.

- [ ] **Step 3: Keep the existing main window factory explicit**

Rename or clarify `createWindow()` to mean main-workspace creation only. The simplest acceptable path is:

```ts
export function createMainWindow(): BrowserWindow
```

Then update `src/main/index.ts` to call `createMainWindow()`.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/main/bootstrap/create-window.test.ts src/main/bootstrap/create-settings-window.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/bootstrap/create-window.ts src/main/bootstrap/create-window.test.ts src/main/bootstrap/create-settings-window.ts src/main/bootstrap/create-settings-window.test.ts src/main/index.ts
git commit -m "feat: add single-instance settings window factory"
```

### Task 3: Register the settings-window IPC handler

**Files:**
- Modify: `src/main/bootstrap/register-ipc.ts`
- Modify: `src/main/bootstrap/register-ipc.test.ts`

- [ ] **Step 1: Write the failing IPC handler test**

Extend `register-ipc.test.ts`:

```ts
expect(
  handleMock.mock.calls.find(([channel]) => channel === ipcChannels.window.openSettings)?.[1]
).toBeTypeOf('function')
```

Then call the handler and assert the opener function ran.

Run: `npx vitest run src/main/bootstrap/register-ipc.test.ts`
Expected: FAIL because `window:open-settings` is not registered.

- [ ] **Step 2: Inject the settings-window opener**

Update `registerIpcHandlers` dependencies:

```ts
type RegisterIpcDependencies = {
  settingsService: SettingsService
  openSettingsWindow: () => BrowserWindow
}
```

Register:

```ts
ipcMain.removeHandler(ipcChannels.window.openSettings)
ipcMain.handle(ipcChannels.window.openSettings, () => {
  openSettingsWindow()
})
```

Update `src/main/index.ts` to pass the new opener.

- [ ] **Step 3: Run the focused test**

Run: `npx vitest run src/main/bootstrap/register-ipc.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/bootstrap/register-ipc.ts src/main/bootstrap/register-ipc.test.ts src/main/index.ts
git commit -m "feat: register settings window IPC handler"
```

## Chunk 2: Preload Bridge and Renderer Entry Restructure

### Task 4: Expose the open-settings preload API

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/contracts.ts`

- [ ] **Step 1: Write the failing preload bridge test**

If there is no preload test harness yet, add a minimal one or extend a nearby IPC bridge test pattern. Assert:

```ts
expect(window.api.windowControls.openSettings).toBeTypeOf('function')
```

Run the smallest available test command for the preload bridge or a direct node-side module test.
Expected: FAIL because the bridge method does not exist.

- [ ] **Step 2: Add the bridge**

Update `src/preload/index.ts`:

```ts
windowControls: {
  close: () => invokeIpcChannel(ipcChannels.window.close),
  minimize: () => invokeIpcChannel(ipcChannels.window.minimize),
  toggleMaximize: () => invokeIpcChannel(ipcChannels.window.toggleMaximize),
  openSettings: () => invokeIpcChannel(ipcChannels.window.openSettings)
}
```

- [ ] **Step 3: Run focused verification**

Run the preload bridge test command.
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/main/ipc/contracts.ts
git commit -m "feat: expose settings window preload bridge"
```

### Task 5: Move renderer onto the approved routing and shell structure

**Files:**
- Create: `src/renderer/src/app/router/index.tsx`
- Create: `src/renderer/src/app/router/route-hosts.tsx`
- Create: `src/renderer/src/app/router/router-context.ts`
- Create: `src/renderer/src/shell/AppShell.tsx`
- Create: `src/renderer/src/shell/LeftRail.tsx`
- Create: `src/renderer/src/shell/LeftRail.test.tsx`
- Create: `src/renderer/src/shell/WindowChrome.tsx`
- Create: `src/renderer/src/shell/WindowChrome.test.tsx`
- Create: `src/renderer/src/pages/home/HomePage.tsx`
- Create: `src/renderer/src/pages/chat/ChatPage.tsx`
- Create: `src/renderer/src/features/home/index.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/app/providers.tsx`
- Modify: `src/renderer/src/features/home/HomeEmptyState.test.tsx`
- Delete: `src/renderer/src/app/router.tsx`
- Delete: `src/renderer/src/app/route-hosts.tsx`
- Delete: `src/renderer/src/app/router-context.ts`
- Delete: `src/renderer/src/app-shell/AppShell.tsx`
- Delete: `src/renderer/src/app-shell/LeftRail.tsx`
- Delete: `src/renderer/src/app-shell/LeftRail.test.tsx`
- Delete: `src/renderer/src/app-shell/WindowChrome.tsx`
- Delete: `src/renderer/src/app-shell/WindowChrome.test.tsx`

- [ ] **Step 1: Write the failing shell-path tests**

Create the new shell-path tests first:

```ts
expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeInTheDocument()
expect(screen.getByTestId('window-chrome-collapse-trigger')).toBeInTheDocument()
```

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/shell/WindowChrome.test.tsx`
Expected: FAIL because the new shell files do not exist yet.

- [ ] **Step 2: Move the renderer shell and router files**

Create the new route tree under `app/router` and move shell components under `shell`.

Route hosts should become:

```tsx
export function RootLayout(): React.JSX.Element {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export function HomeRoute(): React.JSX.Element {
  return <HomePage />
}

export function ChatRoute(): React.JSX.Element {
  return <ChatPage />
}
```

- [ ] **Step 3: Update imports and delete legacy paths**

Remove remaining renderer imports of:

- `@renderer/app-shell/*`
- `./router-context`
- `./route-hosts`
- `./router`

and replace them with the new structure.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/shell/WindowChrome.test.tsx src/renderer/src/features/home/HomeEmptyState.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/app src/renderer/src/shell src/renderer/src/pages src/renderer/src/features/home
git commit -m "refactor: align renderer shell and router structure"
```

## Chunk 3: Renderer State Foundation and Settings Page Surface

### Task 6: Add Redux Toolkit renderer store assembly and feature slices

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/renderer/src/app/store/index.ts`
- Create: `src/renderer/src/app/store/hooks.ts`
- Create: `src/renderer/src/app/providers.test.tsx`
- Modify: `src/renderer/src/app/providers.tsx`
- Create: `src/renderer/src/features/providers/index.ts`
- Create: `src/renderer/src/features/providers/model/providers.types.ts`
- Create: `src/renderer/src/features/providers/model/providers.selectors.ts`
- Create: `src/renderer/src/features/providers/model/slices/providers.slice.ts`
- Create: `src/renderer/src/features/providers/model/slices/index.ts`
- Create: `src/renderer/src/features/settings/index.ts`
- Create: `src/renderer/src/features/settings/model/settings.types.ts`
- Create: `src/renderer/src/features/settings/model/settings.selectors.ts`
- Create: `src/renderer/src/features/settings/model/slices/settings.slice.ts`
- Create: `src/renderer/src/features/settings/model/slices/settings.slice.test.ts`
- Create: `src/renderer/src/features/settings/model/slices/index.ts`
- Delete: `src/renderer/src/lib/stores/settings-store.ts`
- Delete: `src/renderer/src/lib/stores/ui-store.ts`

- [ ] **Step 1: Write the failing reducer and provider tests**

Add reducer tests like:

```ts
expect(settingsReducer(undefined, setActiveSettingsSection('providers')).activeSection).toBe('providers')
expect(providersReducer(undefined, openProviderSetupDialog()).isDialogOpen).toBe(true)
```

Add a provider tree test:

```tsx
render(
  <AppProviders>
    <SettingsProbe />
  </AppProviders>
)
expect(screen.getByText('closed')).toBeInTheDocument()
```

Run: `npx vitest run src/renderer/src/app/providers.test.tsx src/renderer/src/features/settings/model/slices/settings.slice.test.ts`
Expected: FAIL because Redux store assembly does not exist yet.

- [ ] **Step 2: Add Redux Toolkit and feature slices**

Install:

```bash
pnpm add @reduxjs/toolkit react-redux
```

Create store assembly:

```ts
export const store = configureStore({
  reducer: {
    settings: settingsReducer,
    providers: providersReducer
  }
})
```

Implement provider state only for current needs:

- `isDialogOpen`
- `claudeDraft`

Implement settings state only for current needs:

- `activeSection`

Do not keep `settings.isOpen` once the settings window becomes a separate route.

- [ ] **Step 3: Remove renderer Zustand stores**

Delete the old `lib/stores` files and replace all renderer imports with Redux selectors and actions.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/app/providers.test.tsx src/renderer/src/features/settings/model/slices/settings.slice.test.ts src/renderer/src/features/providers/ProviderSetupDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/renderer/src/app/providers.tsx src/renderer/src/app/providers.test.tsx src/renderer/src/app/store src/renderer/src/features/providers src/renderer/src/features/settings src/renderer/src/lib/stores
git commit -m "feat: add renderer redux state foundation"
```

### Task 7: Convert settings UI from dialog to settings page content

**Files:**
- Create: `src/renderer/src/shell/SettingsShell.tsx`
- Create: `src/renderer/src/pages/settings/SettingsPage.tsx`
- Create: `src/renderer/src/features/settings/config/settings-sections.ts`
- Create: `src/renderer/src/features/settings/components/SettingsShellContent.tsx`
- Create: `src/renderer/src/features/settings/components/SettingsSidebar.tsx`
- Modify: `src/renderer/src/features/settings/SettingsDialog.tsx`
- Modify: `src/renderer/src/features/settings/SettingsDialog.test.tsx`
- Modify: `src/renderer/src/features/settings/index.ts`
- Modify: `src/renderer/src/app/router/index.tsx`
- Modify: `src/renderer/src/app/router/route-hosts.tsx`

- [ ] **Step 1: Write the failing settings-page tests**

Replace modal expectations with page-shell expectations:

```tsx
expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
expect(screen.getByRole('tab', { name: 'Chrome Relay' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: '关于' })).toBeInTheDocument()
```

Run: `npx vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx`
Expected: FAIL because the current implementation still renders a modal and the section list is incomplete.

- [ ] **Step 2: Add `SettingsShell` and `/settings` route**

Add the new route:

```ts
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRoute
})
```

Add `SettingsPage`:

```tsx
export function SettingsPage(): React.JSX.Element {
  return (
    <SettingsShell>
      <SettingsDialog />
    </SettingsShell>
  )
}
```

`SettingsDialog` can remain as the exported feature name temporarily, but it must render page content rather than modal framing.

- [ ] **Step 3: Complete the settings section list and fix visible labels**

Ensure the left sidebar includes the full approved list, including:

- `Chrome Relay`
- `用户界面`
- `配色方案`
- `网络`
- `快捷键`
- `数据`
- `使用量`
- `关于`

Also correct any garbled Chinese strings in:

- `features/settings`
- `features/home/HomeEmptyState.tsx`
- `shell/LeftRail.tsx`
- `shell/WindowChrome.tsx`

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx src/renderer/src/features/home/HomeEmptyState.test.tsx src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/shell/WindowChrome.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/shell/SettingsShell.tsx src/renderer/src/pages/settings/SettingsPage.tsx src/renderer/src/features/settings src/renderer/src/features/home/HomeEmptyState.tsx src/renderer/src/shell/LeftRail.tsx src/renderer/src/shell/WindowChrome.tsx
git commit -m "feat: migrate settings UI into settings shell page"
```

## Chunk 4: Connect Main Window Trigger to Dedicated Settings Window

### Task 8: Wire the main-window settings trigger to `openSettings()`

**Files:**
- Modify: `src/renderer/src/shell/LeftRail.tsx`
- Modify: `src/renderer/src/shell/LeftRail.test.tsx`
- Modify: `src/renderer/src/shell/AppShell.tsx`
- Modify: `src/renderer/src/features/settings/SettingsDialog.tsx`

- [ ] **Step 1: Write the failing trigger test**

Update the shell trigger test to mock:

```ts
window.api.windowControls.openSettings = vi.fn()
```

Then assert:

```ts
await user.hover(screen.getByRole('button', { name: '更多操作' }))
await user.click(screen.getByRole('button', { name: '设置' }))
expect(window.api.windowControls.openSettings).toHaveBeenCalledTimes(1)
```

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx`
Expected: FAIL because the rail still tries to open an in-renderer settings surface.

- [ ] **Step 2: Remove modal mounting from the main shell**

Update `AppShell` so it no longer renders settings as a child overlay.

The main shell should still render provider setup if that remains main-window-local, but settings should be removed from the main renderer shell.

- [ ] **Step 3: Trigger the new preload API**

Update the settings action in `LeftRail`:

```ts
const handleOpenSettings = (): void => {
  void window.api.windowControls.openSettings()
}
```

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/shell/AppShell.tsx src/renderer/src/shell/LeftRail.tsx src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/features/settings/SettingsDialog.tsx
git commit -m "feat: open settings in dedicated window from main shell"
```

### Task 9: Make the settings window load the `/settings` route

**Files:**
- Modify: `src/main/bootstrap/create-settings-window.ts`
- Modify: `src/main/bootstrap/create-settings-window.test.ts`
- Modify: `src/main/bootstrap/create-window.ts`

- [ ] **Step 1: Write the failing route-load test**

Extend the settings-window factory test to assert it loads the settings route specifically.

In dev:

```ts
expect(browserWindowInstance.loadURL).toHaveBeenCalledWith(
  expect.stringContaining('/settings')
)
```

In production:

```ts
expect(browserWindowInstance.loadFile).toHaveBeenCalled()
```

with an additional route handoff mechanism if needed.

Run: `npx vitest run src/main/bootstrap/create-settings-window.test.ts`
Expected: FAIL until the route is explicitly loaded.

- [ ] **Step 2: Implement route targeting**

Use the simplest route-aware approach that works with the current renderer:

- in dev, load the renderer URL with the settings route appended
- in production, load the renderer file and include the route via hash/path that the router can resolve

Keep the mechanism consistent between `createMainWindow()` and `openSettingsWindow()`.

- [ ] **Step 3: Run focused verification**

Run: `npx vitest run src/main/bootstrap/create-settings-window.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/bootstrap/create-settings-window.ts src/main/bootstrap/create-settings-window.test.ts src/main/bootstrap/create-window.ts
git commit -m "feat: load settings route in settings window"
```

## Chunk 5: Full Verification and Final Cleanup

### Task 10: Remove dead modal semantics and stale settings visibility state

**Files:**
- Modify: any renderer file still referencing settings modal visibility
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing residue check**

Run:

```bash
rg "isSettingsDialogOpen|openSettingsDialog|closeSettingsDialog|lib/stores|app-shell/" src/renderer/src
```

Expected: remaining legacy matches are listed.

- [ ] **Step 2: Remove dead references**

Delete or refactor remaining legacy modal semantics so the settings feature only models:

- active section
- settings values/drafts

Remove `zustand` from dependencies if no renderer code still imports it:

```bash
pnpm install
```

- [ ] **Step 3: Re-run the residue check**

Run:

```bash
rg "isSettingsDialogOpen|openSettingsDialog|closeSettingsDialog|lib/stores|app-shell/" src/renderer/src
```

Expected: no matches

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/renderer/src
git commit -m "refactor: remove legacy settings modal state"
```

### Task 11: Run full verification

**Files:**
- No planned file edits unless verification finds issues

- [ ] **Step 1: Run main-process tests**

Run:

```bash
npx vitest run src/main/bootstrap/create-window.test.ts src/main/bootstrap/create-settings-window.test.ts src/main/bootstrap/register-ipc.test.ts
```

Expected: PASS

- [ ] **Step 2: Run renderer settings-window regression tests**

Run:

```bash
npx vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/shell/WindowChrome.test.tsx src/renderer/src/features/home/HomeEmptyState.test.tsx src/renderer/src/features/providers/ProviderSetupDialog.test.tsx src/renderer/src/app/providers.test.tsx src/renderer/src/features/settings/model/slices/settings.slice.test.ts
```

Expected: PASS

- [ ] **Step 3: Run type checking**

Run:

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Run lint and record current status honestly**

Run:

```bash
npm run lint
```

Expected:

- if PASS, record PASS
- if FAIL because of unrelated existing repository-wide issues, record that explicitly and do not claim the migration introduced them unless the output shows it

- [ ] **Step 5: Run optional manual window verification**

Run:

```bash
npm run dev
```

Manual checks:

- main window opens normally
- clicking settings opens a separate settings window
- opening settings twice focuses the same settings window
- closing settings leaves the main window untouched
- settings window shows the full sidebar and settings content

- [ ] **Step 6: Commit final stabilization changes**

```bash
git add src/main src/preload src/renderer/src package.json pnpm-lock.yaml
git commit -m "feat: migrate moon settings to dedicated window"
```
