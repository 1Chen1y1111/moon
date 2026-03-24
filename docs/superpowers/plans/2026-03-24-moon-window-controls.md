# Moon Window Controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared custom window controls for Moon that support minimize, close, and dynamic maximize/restore behavior across both workspace and settings windows, with macOS and Windows rendering differences driven by real Electron window state.

**Architecture:** Extend Electron main to expose window state and push maximize-state updates, bridge that state through preload, and keep one shared renderer chrome component that branches by platform for presentation. Window lifecycle state remains in main/preload, not Redux.

**Tech Stack:** Electron, TypeScript, React, preload IPC bridge, Vitest, Testing Library

---

## File Structure Map

### New files to create

- `src/main/ipc/window-state.ts`
- `src/main/preload/window-controls.test.ts`

### Existing files to modify

- `src/main/ipc/channels.ts`
- `src/main/ipc/contracts.ts`
- `src/main/bootstrap/register-ipc.ts`
- `src/main/bootstrap/register-ipc.test.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/main/bootstrap/create-window.test.ts`
- `src/main/bootstrap/create-settings-window.test.ts`
- `src/renderer/src/shell/WindowChrome.tsx`
- `src/renderer/src/shell/WindowChrome.test.tsx`
- `src/renderer/src/shell/WorkspaceShell.tsx`
- `src/renderer/src/shell/SettingsWindowShell.tsx`

## Chunk 1: Main-Process Window State API

### Task 1: Add IPC contracts for querying and subscribing to window state

**Files:**
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/ipc/contracts.ts`

- [ ] **Step 1: Write the failing contract test**

Add a new node-side test or extend the existing IPC channel test with:

```ts
expect(ipcChannels.window.getState).toBe('window:get-state')
expect(ipcChannels.window.onStateChange).toBe('window:on-state-change')
```

Run: `npx vitest run src/main/ipc/channels.test.ts`
Expected: FAIL because the new channels do not exist yet.

- [ ] **Step 2: Add the minimal channels and types**

Extend `ipcChannels.window`:

```ts
getState: 'window:get-state',
onStateChange: 'window:on-state-change'
```

Add a typed state model to `contracts.ts`:

```ts
export type WindowState = {
  isMaximized: boolean
}
```

Add IPC contract entries:

```ts
[ipcChannels.window.getState]: {
  request: undefined
  response: WindowState
}
```

Update `MoonApi.windowControls` to include:

```ts
getState: () => Promise<WindowState>
onStateChange: (listener: (state: WindowState) => void) => () => void
```

- [ ] **Step 3: Re-run the focused test**

Run: `npx vitest run src/main/ipc/channels.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/channels.ts src/main/ipc/contracts.ts src/main/ipc/channels.test.ts
git commit -m "feat: add window state IPC contracts"
```

### Task 2: Register `getState` and state-change handlers in Electron main

**Files:**
- Create: `src/main/ipc/window-state.ts`
- Modify: `src/main/bootstrap/register-ipc.ts`
- Modify: `src/main/bootstrap/register-ipc.test.ts`

- [ ] **Step 1: Write the failing IPC handler tests**

Extend `register-ipc.test.ts` to require:

```ts
const getStateHandler = handleMock.mock.calls.find(
  ([channel]) => channel === ipcChannels.window.getState
)?.[1]

expect(await getStateHandler?.({ sender: {} })).toEqual({ isMaximized: false })
```

Also assert that state listeners are wired when a sender window exists.

Run: `npx vitest run src/main/bootstrap/register-ipc.test.ts`
Expected: FAIL because the new handlers are not registered yet.

- [ ] **Step 2: Add a reusable window-state helper**

Create `src/main/ipc/window-state.ts` with:

```ts
export function getBrowserWindowState(window: BrowserWindow): WindowState {
  return {
    isMaximized: window.isMaximized()
  }
}
```

Update `register-ipc.ts` to:

- remove handlers for `window:get-state`
- register a `getState` handler that resolves `BrowserWindow.fromWebContents(event.sender)`
- return `{ isMaximized }`

For `onStateChange`, use `event.sender.send(...)` or an equivalent event channel and subscribe to:

- `maximize`
- `unmaximize`

The sender window must be the one that emits state changes back to the correct renderer.

- [ ] **Step 3: Re-run the focused test**

Run: `npx vitest run src/main/bootstrap/register-ipc.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/window-state.ts src/main/bootstrap/register-ipc.ts src/main/bootstrap/register-ipc.test.ts
git commit -m "feat: add main window state handlers"
```

## Chunk 2: Preload Bridge

### Task 3: Expose `getState` and `onStateChange` in preload

**Files:**
- Create: `src/main/preload/window-controls.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Write the failing preload bridge test**

Create a test that imports the preload bridge and asserts:

```ts
expect(api.windowControls.getState).toBeTypeOf('function')
expect(api.windowControls.onStateChange).toBeTypeOf('function')
```

Run: `npx vitest run src/main/preload/window-controls.test.ts`
Expected: FAIL because the bridge methods do not exist yet.

- [ ] **Step 2: Add the preload methods**

Update `src/preload/index.ts`:

```ts
windowControls: {
  close,
  minimize,
  toggleMaximize,
  getState: () => invokeIpcChannel(ipcChannels.window.getState),
  onStateChange: (listener) => {
    const channel = ipcChannels.window.onStateChange
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  }
}
```

Update `index.d.ts` through `MoonApi` typing so renderer sees the new methods.

- [ ] **Step 3: Re-run the preload test**

Run: `npx vitest run src/main/preload/window-controls.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts src/main/preload/window-controls.test.ts
git commit -m "feat: expose window state preload bridge"
```

## Chunk 3: Shared Renderer Window Chrome

### Task 4: Make `WindowChrome` stateful and platform-aware

**Files:**
- Modify: `src/renderer/src/shell/WindowChrome.tsx`
- Modify: `src/renderer/src/shell/WindowChrome.test.tsx`

- [ ] **Step 1: Write the failing renderer tests**

Extend `WindowChrome.test.tsx` with:

```ts
expect(screen.getByRole('button', { name: '最大化窗口' })).toBeInTheDocument()
```

Then simulate a maximized state and assert:

```ts
expect(screen.getByRole('button', { name: '还原窗口' })).toBeInTheDocument()
```

Add a Windows-specific ordering assertion:

```ts
const buttons = screen.getAllByRole('button')
// minimize -> maximize/restore -> close
```

Add a macOS-specific ordering assertion:

```ts
// close -> minimize -> maximize/restore
```

Run: `npx vitest run src/renderer/src/shell/WindowChrome.test.tsx`
Expected: FAIL because `WindowChrome` does not know maximize state yet.

- [ ] **Step 2: Add shared state logic**

Inside `WindowChrome.tsx`:

- query `window.api.windowControls.getState()` on mount
- subscribe with `onStateChange()`
- keep local `isMaximized` state

Use one shared logic path, then branch rendering:

```ts
if (process.platform === 'darwin') {
  return <MacWindowChrome ... />
}

return <WindowsWindowChrome ... />
```

The middle action should always call `toggleMaximize`, but its label and icon should swap based on `isMaximized`.

- [ ] **Step 3: Re-run the renderer chrome tests**

Run: `npx vitest run src/renderer/src/shell/WindowChrome.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/shell/WindowChrome.tsx src/renderer/src/shell/WindowChrome.test.tsx
git commit -m "feat: add shared maximize restore window chrome"
```

### Task 5: Reuse the same chrome in workspace and settings shells

**Files:**
- Modify: `src/renderer/src/shell/WorkspaceShell.tsx`
- Modify: `src/renderer/src/shell/SettingsWindowShell.tsx`
- Modify: `src/renderer/src/features/settings/components/SettingsPageContent.tsx`
- Modify: `src/renderer/src/features/settings/SettingsPageContent.test.tsx`

- [ ] **Step 1: Write the failing parity test**

Add or extend tests to assert that both shells render the same chrome logic:

```ts
expect(screen.getByRole('button', { name: /最小化窗口|最小化设置/i })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /最大化窗口|还原窗口/i })).toBeInTheDocument()
```

Run: `npx vitest run src/renderer/src/features/settings/SettingsPageContent.test.tsx src/renderer/src/app/router/route-hosts.test.tsx`
Expected: FAIL because settings currently has duplicated control markup.

- [ ] **Step 2: Replace duplicated settings controls with shared chrome**

Remove the inline control cluster from settings page content.

Move the shared chrome into the settings shell header, reusing the same `WindowChrome` component or its extracted internal pieces. Keep the layout consistent, but avoid copy-pasting logic.

- [ ] **Step 3: Re-run the parity tests**

Run: `npx vitest run src/renderer/src/features/settings/SettingsPageContent.test.tsx src/renderer/src/app/router/route-hosts.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/shell/WorkspaceShell.tsx src/renderer/src/shell/SettingsWindowShell.tsx src/renderer/src/features/settings/components/SettingsPageContent.tsx src/renderer/src/features/settings/SettingsPageContent.test.tsx
git commit -m "refactor: share window chrome across workspace and settings"
```

## Chunk 4: Full Verification

### Task 6: Run verification for main, preload, and renderer window controls

**Files:**
- No planned code changes unless verification finds issues

- [ ] **Step 1: Run focused main/preload tests**

Run:

```bash
npx vitest run src/main/ipc/channels.test.ts src/main/bootstrap/register-ipc.test.ts src/main/preload/window-controls.test.ts src/main/bootstrap/create-window.test.ts src/main/bootstrap/create-settings-window.test.ts
```

Expected: PASS

- [ ] **Step 2: Run renderer window chrome tests**

Run:

```bash
npx vitest run src/renderer/src/shell/WindowChrome.test.tsx src/renderer/src/features/settings/SettingsPageContent.test.tsx src/renderer/src/app/router/route-hosts.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run type checking**

Run:

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Run lint and report current status honestly**

Run:

```bash
npm run lint
```

Expected:

- if PASS, record PASS
- if FAIL due to existing repository-wide issues, record that explicitly with examples

- [ ] **Step 5: Optional manual verification**

Run:

```bash
npm run dev
```

Manual checks:

- workspace window shows platform-correct control layout
- settings window shows the same control logic
- maximize switches to restore
- restore switches back to maximize
- minimize still works
- close still works

- [ ] **Step 6: Commit final stabilization changes**

```bash
git add src/main src/preload src/renderer/src
git commit -m "feat: unify moon window controls"
```
