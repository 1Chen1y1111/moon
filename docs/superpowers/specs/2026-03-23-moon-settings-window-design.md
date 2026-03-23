# Moon Settings Window Design

## Overview

Moon should move away from rendering settings as an in-app modal and instead open settings in a dedicated Electron window.

This aligns better with desktop AI tools such as DeepChat, Alma, and Cherry Studio, where settings behave like a separate shell rather than a temporary overlay.

The main workspace should remain open and unaffected while the settings window is shown.

## Product Goal

Ship settings as an independent application surface with these properties:

- the main workspace window remains open
- clicking settings opens a dedicated settings window
- repeated settings opens focus the existing settings window instead of spawning duplicates
- settings has its own shell and navigation structure
- settings is no longer mounted as a modal inside the main workspace renderer

## Window Model

Moon should expose two window roles:

1. `main`
2. `settings`

### Main Window

Responsibilities:

- render the normal Moon workspace shell
- host chat and primary workflow surfaces
- trigger opening the settings window

### Settings Window

Responsibilities:

- render the settings shell
- host the full settings navigation and content area
- behave like a stable desktop preferences surface

### Window Relationship

Rules:

- opening settings must not hide or replace the main window
- only one settings window should exist at a time
- if the settings window already exists, opening settings should focus it
- closing the settings window must not affect the main window
- on macOS app activation, if all windows are closed, the main window should still be the default recreated window

## Why Window Instead of Modal

The current settings shape already behaves like a full settings application:

- many navigation items
- large content panels
- likely future expansion

A modal is too constrained for this surface. It makes the settings experience feel temporary and visually cramped.

A dedicated window:

- better matches desktop expectations
- scales to more sections without forcing modal compromises
- allows the settings surface to evolve independently
- keeps workspace context intact in the main window

## Architecture Boundaries

### Electron Main Process

The main process should own window lifecycle.

Add a dedicated settings window manager path with these responsibilities:

- create the settings window
- track whether one already exists
- focus the settings window if it already exists
- clear the cached reference when the settings window closes

The settings window should not be controlled through renderer-only state.

### Preload

Preload should expose a dedicated API for opening settings.

Recommended addition:

```text
window.api.windowControls.openSettings()
```

This keeps the renderer from knowing how windows are created.

### Renderer

Renderer responsibilities split into two surfaces:

- main renderer surface
- settings renderer surface

The main renderer should only trigger the settings window open action.

The settings renderer should render the settings shell and settings routes.

## Renderer Structure

The approved renderer structure remains:

```text
app/
shell/
pages/
features/
shared/
```

This design adds a dedicated settings shell and settings page:

```text
src/renderer/src/
  shell/
    AppShell.tsx
    SettingsShell.tsx

  pages/
    home/
      HomePage.tsx
    chat/
      ChatPage.tsx
    settings/
      SettingsPage.tsx

  features/
    settings/
      ...
```

### `AppShell`

Continues to own the main workspace shell.

### `SettingsShell`

New shell responsible for:

- settings window layout
- settings title/header area
- left settings navigation
- right settings content viewport
- footer action area if retained

### `SettingsPage`

A route-level entry for the settings surface.

It should compose:

- `SettingsShell`
- `features/settings` content

## Routing Strategy

Moon should use a dedicated route for settings:

```text
/           -> main home
/chat       -> chat
/settings   -> settings window surface
```

The same renderer bundle can serve both windows.

Recommended behavior:

- the main window loads the normal root route
- the settings window loads the renderer with the `/settings` route active

This avoids needing a completely separate renderer build while still giving settings a first-class surface.

## Settings Feature Reuse

The current settings UI rebuild work should be reused, not discarded.

Reusable parts:

- settings section config
- settings sidebar component
- settings content component
- settings slice and selectors

What changes:

- remove dialog container behavior
- remove dialog open/close semantics from renderer state
- render settings as page content inside `SettingsShell`

## State Ownership

The renderer should no longer model settings visibility with an `isOpen` flag.

### Keep in Renderer State

- active settings section
- settings values and drafts
- feature-specific settings data

### Remove from Renderer State

- whether the settings window exists
- whether the settings window is open

Those are window lifecycle concerns and should belong to Electron main.

## UI Behavior

### From Main Window

Clicking settings in the main window should:

1. call preload API
2. forward to main process
3. create or focus the settings window

### In Settings Window

The settings UI should:

- show the full left navigation list
- render the selected section on the right
- use real window chrome behavior rather than pretending to be a modal

The visual shell can stay very close to the current rebuilt settings UI, but it should feel like a standalone preferences surface rather than a floating overlay.

## Migration Strategy

Migrate in two phases.

### Phase 1: Shell Migration

Convert settings from `dialog` presentation to `settings page` presentation inside renderer:

- add `SettingsShell`
- add `SettingsPage`
- keep current settings feature internals
- remove modal framing from the settings component

This proves the layout and page model independently of Electron window creation.

### Phase 2: Window Integration

Add dedicated settings window support in Electron:

- main process settings window factory
- preload open-settings bridge
- main window trigger wiring
- load `/settings` in the settings window
- remove settings modal mounting from `AppShell`

This keeps the migration incremental and reduces risk.

## IPC and API Additions

Recommended additions:

- new IPC channel for opening settings window
- preload wrapper under `windowControls` or a dedicated `windows` namespace

The renderer should not call Electron APIs directly.

## Error Handling

The system should gracefully handle:

- attempting to open settings when it is already open
- focusing a minimized settings window
- missing main-window-origin state when settings opens independently

If the settings window creation fails, the main window should remain usable and the error should be surfaced through logging first.

## Testing Strategy

### Main Process Tests

Add tests for:

- creating settings window once
- focusing existing settings window on repeated open requests
- clearing stored reference on close

### Preload / IPC Tests

Add tests for:

- preload open-settings bridge calls the correct channel
- IPC handler resolves correctly

### Renderer Tests

Add tests for:

- main window settings trigger invokes open-settings action
- settings page renders full shell without modal role
- settings sidebar navigation still switches sections correctly

## Success Criteria

This migration is successful if:

- settings opens in a dedicated Electron window
- the main window stays open and unchanged
- the settings window is single-instance and focusable
- the settings UI no longer behaves like a modal
- the existing settings sidebar/content work remains reusable
- renderer state no longer owns settings-window visibility
