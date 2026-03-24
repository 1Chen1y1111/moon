# Moon Window Controls Design

## Overview

Moon should unify custom window controls across the main workspace window and the dedicated settings window.

The current implementation only supports a limited close/minimize/toggle path and is visually biased toward the existing sidebar traffic-light layout. It does not expose explicit maximize state to the renderer, which prevents correct dynamic rendering of maximize versus restore controls.

This design defines a single window-control system with:

- shared logic for both workspace and settings windows
- platform-specific presentation for macOS and Windows
- explicit maximize-state synchronization from Electron main to renderer

## Product Goal

Ship custom window controls that:

- keep `minimize`
- dynamically switch the middle control between `maximize` and `restore`
- keep `close`
- work in both the workspace window and the settings window
- share one renderer control component and one preload/main state flow

## Platform Behavior

### macOS

Use left-aligned traffic-light controls:

1. close
2. minimize
3. maximize or restore

Behavior:

- if the window is not maximized, the third button represents maximize
- if the window is maximized, the third button represents restore

The visual placement should remain consistent with the current Moon chrome language.

### Windows

Use right-aligned titlebar controls:

1. minimize
2. maximize or restore
3. close

Behavior:

- if the window is not maximized, show maximize
- if the window is maximized, show restore

The Windows version should not reuse macOS traffic-light visuals. The logic is shared, but the presentation is platform-specific.

## Shared Control Logic

Both the workspace window and the settings window should use the same logical control API:

- `close`
- `minimize`
- `toggleMaximize`
- `getState`
- `onStateChange`

Renderer should not infer window state from clicks alone. It should receive the real maximize state from Electron.

## Main Process Responsibilities

Electron main should own authoritative window state.

Add support for:

1. querying current window state
2. subscribing to future state changes
3. emitting updates on maximize/unmaximize transitions

### Required Window State

At minimum:

```text
WindowState
- isMaximized: boolean
```

Future-safe optional fields may be added later, but this scope only requires maximize state.

### IPC Responsibilities

Add two capabilities:

- `window:get-state`
- `window:on-state-change`

`window:get-state` returns the sender window's current state.

`window:on-state-change` should push updates whenever the sender window enters or leaves maximized state.

Recommended event sources:

- `maximize`
- `unmaximize`

If needed later, this can expand to include:

- `enter-full-screen`
- `leave-full-screen`

## Preload Responsibilities

Preload should expose a renderer-safe bridge for both commands and state.

Recommended API:

```ts
window.api.windowControls = {
  close,
  minimize,
  toggleMaximize,
  getState,
  onStateChange
}
```

`getState()` returns the current state once.

`onStateChange(listener)` subscribes to later changes and returns an unsubscribe function.

This must work for whichever window invokes it, without the renderer needing to know whether it is running inside the workspace or settings window.

## Renderer Responsibilities

Renderer should own presentation, not truth.

The shared window-control component should:

1. request initial state from preload
2. subscribe to state-change updates
3. render maximize or restore based on `isMaximized`

### Shared Component Boundary

Moon should keep one shared window control component, used in both:

- workspace shell
- settings window shell

The component should separate:

- shared logic: state loading, subscriptions, action wiring
- platform presentation: macOS layout versus Windows layout

## Recommended Renderer Structure

```text
shell/
  WindowChrome.tsx
```

`WindowChrome.tsx` should remain the shared entry point, but internally it should branch by platform for rendering.

A reasonable internal split is:

- `MacWindowChrome`
- `WindowsWindowChrome`

This split can remain internal to the file unless it grows.

## Data Flow

```text
BrowserWindow state in Electron main
-> IPC get-state / state-change
-> preload bridge
-> WindowChrome local renderer state
-> platform-specific maximize/restore button rendering
```

The renderer should not store maximize state in Redux. It is ephemeral window lifecycle state, not application domain state.

## Settings Window Parity

The settings window should reuse the same `WindowChrome` logic and visual treatment style as the workspace window.

That means:

- same control component
- same state bridge
- same maximize/restore behavior

But the container layout may position it differently if needed for settings-shell composition.

## Error Handling

If `getState()` fails:

- default to `isMaximized: false`
- log the failure
- keep controls usable

If the state subscription cannot be established:

- renderer should still work with command-only behavior
- maximize/restore icon may fall back to initial state only

## Testing Strategy

### Main Process Tests

Add tests for:

- `window:get-state` returns `isMaximized`
- maximize event emits state-changed payload
- unmaximize event emits state-changed payload
- state is scoped to the sender window

### Preload Tests

Add tests for:

- `window.api.windowControls.getState` exists
- `window.api.windowControls.onStateChange` exists
- `onStateChange` wires to the correct IPC event

### Renderer Tests

Add tests for:

- macOS chrome renders left-aligned close/minimize/maximize
- Windows chrome renders right-aligned minimize/maximize/close
- maximize state swaps maximize icon to restore icon
- restore state swaps it back
- both workspace and settings shells render the same shared chrome logic

## Success Criteria

This work is successful if:

- workspace and settings windows both use the same control logic
- macOS and Windows render the correct platform-specific layouts
- the middle control switches between maximize and restore based on real window state
- renderer receives maximize state from Electron main instead of guessing
- tests cover the main/preload/renderer flow
