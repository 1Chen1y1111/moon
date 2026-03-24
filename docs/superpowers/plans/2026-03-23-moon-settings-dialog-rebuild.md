# Moon Settings Dialog Rebuild Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Moon settings dialog to match the approved 1:1 desktop design while moving the renderer onto the approved `app / shell / pages / features / shared` structure and replacing renderer Zustand state with Redux Toolkit.

**Architecture:** Move renderer assembly concerns into `app`, global layout into `shell`, and settings UI/state into `features/settings`. Keep shadcn untouched, wire Redux Toolkit through `app/store`, and let `shell` trigger the global settings dialog while `features/settings` owns the dialog content, section config, and tests.

**Tech Stack:** Electron renderer, React 19, TypeScript, TanStack Router, Redux Toolkit, React Redux, Tailwind CSS, shadcn/ui, Vitest, Testing Library

---

## File Structure Map

### New files to create

- `src/renderer/src/app/router/index.tsx`
- `src/renderer/src/app/router/route-hosts.tsx`
- `src/renderer/src/app/router/router-context.ts`
- `src/renderer/src/app/store/index.ts`
- `src/renderer/src/app/store/hooks.ts`
- `src/renderer/src/shell/AppShell.tsx`
- `src/renderer/src/shell/LeftRail.tsx`
- `src/renderer/src/shell/LeftRail.test.tsx`
- `src/renderer/src/shell/WindowChrome.tsx`
- `src/renderer/src/shell/WindowChrome.test.tsx`
- `src/renderer/src/pages/home/HomePage.tsx`
- `src/renderer/src/pages/chat/ChatPage.tsx`
- `src/renderer/src/features/home/index.ts`
- `src/renderer/src/features/settings/components/SettingsDialog.tsx`
- `src/renderer/src/features/settings/components/SettingsSidebar.tsx`
- `src/renderer/src/features/settings/components/SettingsContent.tsx`
- `src/renderer/src/features/settings/config/settings-sections.ts`
- `src/renderer/src/features/settings/model/settings.types.ts`
- `src/renderer/src/features/settings/model/settings.selectors.ts`
- `src/renderer/src/features/settings/model/slices/settings.slice.test.ts`
- `src/renderer/src/features/settings/model/slices/settings.slice.ts`
- `src/renderer/src/features/settings/model/slices/index.ts`
- `src/renderer/src/features/settings/index.ts`

### Existing files to modify

- `package.json`
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
- `src/renderer/src/features/settings/SettingsDialog.tsx`
- `src/renderer/src/features/settings/SettingsDialog.test.tsx`
- `src/renderer/src/features/home/HomeEmptyState.tsx`
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
- `src/renderer/src/features/settings/SettingsDialog.tsx`
- `src/renderer/src/lib/stores/settings-store.ts`
- `src/renderer/src/lib/stores/ui-store.ts`

## Chunk 1: Renderer Structure and Redux Foundation

### Task 1: Add Redux Toolkit dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Write the failing dependency check**

Run: `npm run typecheck`
Expected: the current build still references Zustand-only state and there is no Redux Toolkit setup yet.

- [ ] **Step 2: Add the minimal dependency changes**

Update `package.json` dependencies:

```json
{
  "dependencies": {
    "@reduxjs/toolkit": "^2.x",
    "react-redux": "^9.x"
  }
}
```

Keep `zustand` only if another feature still imports it during the migration. Remove it in the final cleanup task if no renderer code references it anymore.

- [ ] **Step 3: Install and verify lockfile changes**

Run: `pnpm add @reduxjs/toolkit react-redux`
Expected: `pnpm-lock.yaml` updates with Redux Toolkit packages present.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add redux toolkit for renderer state"
```

### Task 2: Move router and shell files into the approved structure

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
- Delete: `src/renderer/src/app/router.tsx`
- Delete: `src/renderer/src/app/route-hosts.tsx`
- Delete: `src/renderer/src/app/router-context.ts`
- Delete: `src/renderer/src/app-shell/AppShell.tsx`
- Delete: `src/renderer/src/app-shell/LeftRail.tsx`
- Delete: `src/renderer/src/app-shell/LeftRail.test.tsx`
- Delete: `src/renderer/src/app-shell/WindowChrome.tsx`
- Delete: `src/renderer/src/app-shell/WindowChrome.test.tsx`

- [ ] **Step 1: Write the failing structure test**

Create a smoke test for the top-level app composition in a new test file if needed, or extend an existing shell test to assert:

```tsx
expect(screen.getByRole('navigation', { name: /workspace navigation/i })).toBeInTheDocument()
expect(screen.getByRole('main')).toBeInTheDocument()
```

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx`
Expected: FAIL after import paths are updated but before files are moved.

- [ ] **Step 2: Move files into the new target paths**

Implement the new top-level structure:

```tsx
// src/renderer/src/pages/home/HomePage.tsx
import { HomeEmptyState } from '@renderer/features/home'

export function HomePage(): React.JSX.Element {
  return <HomeEmptyState />
}
```

```tsx
// src/renderer/src/app/router/route-hosts.tsx
import { Outlet } from '@tanstack/react-router'
import { AppShell } from '@renderer/shell/AppShell'
import { HomePage } from '@renderer/pages/home/HomePage'
import { ChatPage } from '@renderer/pages/chat/ChatPage'
```

- [ ] **Step 3: Update imports**

Replace imports that still point to:

- `@renderer/app-shell/*`
- `@renderer/app/router`
- `@renderer/app/route-hosts`
- `@renderer/app/router-context`

with the new `shell`, `pages`, and `app/router` paths.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/shell/WindowChrome.test.tsx`
Expected: PASS after the tests are moved or updated to reference the new paths.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/app src/renderer/src/shell src/renderer/src/pages
git commit -m "refactor: align renderer shell and routing structure"
```

### Task 3: Introduce app-level Redux store assembly

**Files:**

- Create: `src/renderer/src/app/store/index.ts`
- Create: `src/renderer/src/app/store/hooks.ts`
- Modify: `src/renderer/src/app/providers.tsx`

- [ ] **Step 1: Write the failing store smoke test**

Add a provider-level test or extend an existing settings test to render a component that calls `useAppSelector`.

```tsx
render(
  <AppProviders>
    <TestProbe />
  </AppProviders>
)
```

Expected initial failure: `could not find react-redux context value`.

- [ ] **Step 2: Add the minimal Redux assembly**

Create the store:

```ts
// src/renderer/src/app/store/index.ts
import { configureStore } from '@reduxjs/toolkit'
import { settingsReducer } from '@renderer/features/settings'

export const store = configureStore({
  reducer: {
    settings: settingsReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
```

Create typed hooks:

```ts
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import type { AppDispatch, RootState } from './index'

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
```

Wrap the app provider tree with `<Provider store={store}>`.

- [ ] **Step 3: Run focused verification**

Run: `npx vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx`
Expected: FAIL only for missing settings slice implementation, not for missing Redux provider.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/app/providers.tsx src/renderer/src/app/store
git commit -m "feat: add renderer redux store assembly"
```

## Chunk 2: Settings Feature Migration and Dialog Rebuild

### Task 4: Create the settings feature model and section config

**Files:**

- Create: `src/renderer/src/features/settings/model/settings.types.ts`
- Create: `src/renderer/src/features/settings/model/settings.selectors.ts`
- Create: `src/renderer/src/features/settings/model/slices/settings.slice.test.ts`
- Create: `src/renderer/src/features/settings/model/slices/settings.slice.ts`
- Create: `src/renderer/src/features/settings/model/slices/index.ts`
- Create: `src/renderer/src/features/settings/config/settings-sections.ts`
- Create: `src/renderer/src/features/settings/index.ts`
- Delete: `src/renderer/src/lib/stores/settings-store.ts`
- Delete: `src/renderer/src/lib/stores/ui-store.ts`

- [ ] **Step 1: Write the failing reducer test**

Create a reducer test such as:

```ts
expect(settingsReducer(undefined, settingsDialogOpened()).isOpen).toBe(true)
expect(settingsReducer(undefined, settingsSectionChanged('providers')).activeSection).toBe(
  'providers'
)
```

Run: `npx vitest run src/renderer/src/features/settings/model/settings.slice.test.ts`
Expected: FAIL because the slice and actions do not exist yet.

- [ ] **Step 2: Define the feature state and config**

Model the state with only what this UI needs now:

```ts
export type SettingsSectionId =
  | 'general'
  | 'providers'
  | 'agents'
  | 'channels'
  | 'projects'
  | 'chat'
  | 'token-savings'
  | 'quick-prompts'
  | 'memory'
  | 'mcp-servers'
  | 'skills'
  | 'plugins'
  | 'hooks'
  | 'voice'
  | 'text-to-speech'
  | 'people'
  | 'web-search'
```

The slice should support:

- `openSettingsDialog`
- `closeSettingsDialog`
- `setActiveSettingsSection`

The section config should include:

- `id`
- `label`
- `icon`
- `title`
- `description`
- `kind: 'general' | 'placeholder'`

- [ ] **Step 3: Export the feature API**

Use `features/settings/index.ts` to export:

- `SettingsDialog`
- `settingsReducer`
- settings actions
- settings selectors

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/features/settings/model/settings.slice.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/settings src/renderer/src/lib/stores
git commit -m "refactor: move settings state into redux feature slice"
```

### Task 5: Rebuild the settings dialog UI and sidebar switching

**Files:**

- Create: `src/renderer/src/features/settings/components/SettingsDialog.tsx`
- Create: `src/renderer/src/features/settings/components/SettingsSidebar.tsx`
- Create: `src/renderer/src/features/settings/components/SettingsContent.tsx`
- Modify: `src/renderer/src/features/settings/SettingsDialog.test.tsx`
- Delete: `src/renderer/src/features/settings/SettingsDialog.tsx`

- [ ] **Step 1: Write the failing UI tests**

Replace the current dialog tests with assertions for the approved design:

```tsx
expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument()
expect(screen.getByText('工具模型')).toBeInTheDocument()
expect(screen.getByText('Coding Agent')).toBeInTheDocument()
```

Add a switch test:

```tsx
await user.click(screen.getByRole('tab', { name: '提供商' }))
expect(screen.getByRole('heading', { name: '提供商' })).toBeInTheDocument()
expect(screen.getByText(/页面内容待补齐/i)).toBeInTheDocument()
```

Add a close test:

```tsx
await user.click(screen.getByRole('button', { name: '关闭设置' }))
expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx`
Expected: FAIL because the current dialog is English-only, uses the old sections, and is still wired to Zustand.

- [ ] **Step 3: Implement the dialog shell**

Create a dialog layout with:

- header title bound to active section
- left scrollable menu with screenshot-order sections
- right scrollable content area
- footer status text plus `关闭` and `保存` buttons
- right-top close button cluster styling

Implement the `general` panel with:

- `工具模型` card
- `了解更多` link
- fake select row showing `gpt-5.4`
- `Coding Agent` card
- fake `自动` select row
- `管理 Providers` button

Implement placeholder content for every non-general section.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/settings/components src/renderer/src/features/settings/SettingsDialog.test.tsx
git commit -m "feat: rebuild settings dialog shell and sidebar switching"
```

### Task 6: Wire shell triggers into the settings slice

**Files:**

- Modify: `src/renderer/src/shell/AppShell.tsx`
- Modify: `src/renderer/src/shell/LeftRail.tsx`
- Modify: `src/renderer/src/features/providers/ProviderSetupDialog.tsx`

- [ ] **Step 1: Write the failing interaction test**

Extend the left rail test to cover opening settings:

```tsx
await user.click(screen.getByRole('button', { name: /设置/i }))
expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument()
```

If the settings entry is inside the hover menu, assert the menu opens first and then the dialog opens.

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/features/settings/SettingsDialog.test.tsx`
Expected: FAIL because the existing shell still uses the old imports and old state wiring.

- [ ] **Step 3: Implement the shell integration**

Update `LeftRail` to dispatch `openSettingsDialog`.

Update `AppShell` to render the new settings feature component from `@renderer/features/settings`.

If `ProviderSetupDialog` still depends on `useUiStore`, either:

- migrate its open state into Redux in the same pattern, or
- temporarily keep provider dialog local to `AppShell` until a later plan

Do not reintroduce a global Zustand store just to preserve old wiring.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/features/settings/SettingsDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/shell src/renderer/src/features/providers
git commit -m "feat: wire settings dialog through shell redux actions"
```

## Chunk 3: Cleanup and Full Verification

### Task 7: Remove obsolete Zustand usage and dead imports

**Files:**

- Modify: `package.json`
- Modify: any renderer file still importing `zustand`

- [ ] **Step 1: Write the failing usage check**

Run: `rg "zustand|lib/stores|app-shell/" src/renderer/src`
Expected: remaining old references are listed.

- [ ] **Step 2: Remove obsolete references**

Delete remaining renderer imports of:

- `zustand`
- `@renderer/lib/stores/*`
- `@renderer/app-shell/*`

Remove `zustand` from `package.json` if no remaining project code requires it.

- [ ] **Step 3: Re-run the usage check**

Run: `rg "zustand|lib/stores|app-shell/" src/renderer/src`
Expected: no matches

- [ ] **Step 4: Commit**

```bash
git add package.json src/renderer/src
git commit -m "refactor: remove renderer zustand and legacy paths"
```

### Task 8: Run full verification

**Files:**

- No code changes required unless verification fails

- [ ] **Step 1: Run settings and shell tests**

Run: `npx vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx src/renderer/src/shell/LeftRail.test.tsx src/renderer/src/shell/WindowChrome.test.tsx`
Expected: PASS

- [ ] **Step 2: Run a broader renderer test sweep**

Run: `npx vitest run src/renderer/src/features/home/HomeEmptyState.test.tsx src/renderer/src/features/providers/ProviderSetupDialog.test.tsx`
Expected: PASS

- [ ] **Step 3: Run type checking**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Optional visual verification**

Run: `npm run dev`
Expected: the settings dialog opens from the left rail and visually matches the approved screenshot structure.

- [ ] **Step 6: Commit final stabilization changes**

```bash
git add src/renderer/src package.json
git commit -m "feat: finalize moon settings dialog rebuild"
```
