# Moon Renderer Architecture Design

## Overview

This document defines the recommended directory architecture for `src/renderer/src` in Moon.

The goals are:

- keep the renderer easy to navigate while the product is still small
- separate app assembly, shell layout, pages, features, and shared code
- avoid top-level bucket directories that become catch-alls
- keep the structure compatible with Electron renderer constraints
- use Redux Toolkit without turning state into a global dumping ground

This design applies only to the renderer. It does not redefine `src/main`, `src/preload`, or `src/shadcn`.

## Architecture Choice

Moon renderer should use a mixed layered structure:

1. `app`
2. `shell`
3. `pages`
4. `features`
5. `shared`

This keeps assembly concerns and layout concerns separate while still allowing business features to own their own UI, state, and configuration.

This is intentionally lighter than a heavily segmented enterprise frontend architecture, but stricter than a flat `components/services/utils/store` project layout.

## Top-Level Structure

```text
src/renderer/src/
  app/
    providers.tsx
    router/
      index.tsx
      route-hosts.tsx
      router-context.ts
    store/
      index.ts
      hooks.ts
    i18n/
      index.ts
      resources.ts

  shell/
    AppShell.tsx
    LeftRail.tsx
    WindowChrome.tsx

  pages/
    home/
      HomePage.tsx
    chat/
      ChatPage.tsx

  features/
    settings/
      components/
        SettingsDialog.tsx
        SettingsSidebar.tsx
        SettingsContent.tsx
      model/
        settings.slice.ts
        settings.selectors.ts
        settings.types.ts
      config/
        settings-sections.ts
      hooks/
        use-settings-dialog.ts
      services/
        settings-adapter.ts
      index.ts

    providers/
      components/
        ProviderSetupDialog.tsx
      model/
        providers.slice.ts
        providers.types.ts
      config/
        provider-options.ts
      services/
        provider-adapter.ts
      index.ts

    home/
      components/
        HomeEmptyState.tsx
      index.ts

  shared/
    assets/
    lib/
    hooks/
    types/
    services/
    config/
    test/
      setup.ts

  App.tsx
  main.tsx
  env.d.ts
```

## Layer Responsibilities

### `app`

`app` is the renderer assembly layer.

It owns:

- router creation
- top-level providers
- Redux store setup
- i18n initialization
- app-wide bootstrapping glue

It should not own feature-specific UI or feature-specific business rules.

### `shell`

`shell` is the global desktop frame for the renderer.

It owns:

- shell layout
- left rail
- window chrome
- shell-level modal mount points
- shell-level orchestration such as opening a global settings dialog

It should not own route-specific page logic.

### `pages`

`pages` contains route-level screens.

A page should mainly compose:

- shell containers
- feature entry components
- page-specific layout

A page should not become the primary home for business state, business config, or reusable feature logic.

### `features`

`features` is the main business layer.

Each feature should own its own:

- components
- Redux slice and selectors
- feature-local types
- feature-local config
- feature-local hooks
- feature-local service adapters

Examples:

- settings dialog implementation belongs in `features/settings`
- provider setup implementation belongs in `features/providers`
- home empty-state composition belongs in `features/home`

### `shared`

`shared` is for code that remains valid across features after removing feature-specific naming and context.

It may contain:

- static assets
- generic helper functions
- generic hooks
- generic types
- cross-feature service utilities
- test setup

It must not become a catch-all for feature-specific state, configs, or adapters.

## Dependency Rules

Recommended dependency direction:

```text
app -> shell, pages, features, shared
shell -> features, shared
pages -> features, shared
features -> shared
shared -> no business-specific layers
```

Hard rules:

- `shared` must not depend on `features`
- `features` must not depend on `pages`
- `shell` must not depend on `pages`
- `pages` should not depend on other pages
- feature-local code should stay inside the feature unless it proves to be truly reusable

## Redux Toolkit Placement

Moon renderer should use Redux Toolkit instead of Zustand.

Placement rules:

- `app/store/index.ts`
  - configure the Redux store
  - combine reducers
  - register middleware
- `app/store/hooks.ts`
  - export typed hooks such as `useAppDispatch` and `useAppSelector`
- `features/*/model/*.slice.ts`
  - define feature slices
- `features/*/model/*.selectors.ts`
  - define feature selectors when they add clarity

This keeps the store assembly global while leaving state ownership inside features.

The renderer should not use a top-level `lib/stores` bucket.

## i18n Placement

i18n is app-level infrastructure and should live in `app/i18n`.

Rules:

- `app/i18n/index.ts` initializes i18n
- `app/i18n/resources.ts` registers global translation resources
- a large feature-specific message set may live in that feature if needed later

This keeps translation bootstrapping global while avoiding premature global text sprawl.

## Services, Hooks, Types, and Config

These categories should not be global by default.

### Services

- use `features/*/services` for feature-specific adapters
- use `shared/services` only for genuinely cross-feature services

### Hooks

- use `features/*/hooks` for feature-local hooks
- use `shared/hooks` only for generic hooks

### Types

- use `features/*/model/*.types.ts` for feature-local types
- use `shared/types` only for cross-feature types

### Config

- use `features/*/config` for feature-local configuration
- use `shared/config` only for cross-feature constants and generic shared config

Decision rule:

If a file stops making sense once its business name is removed, it belongs in the feature, not in `shared`.

## Shadcn Boundary

`src/shadcn` stays where it is.

This architecture does not move or wrap the existing shadcn layer by default.

Rules:

- renderer code may consume shadcn components directly
- Moon should not duplicate a competing generic UI layer inside `shared/ui`
- shadcn remains the external UI base, while feature composition stays in renderer feature folders

## What Does Not Belong in Renderer

The renderer architecture should not introduce a `databases` directory.

Database access belongs to the Electron main process boundary, not the renderer.

Likewise, process-specific background orchestration such as long-running workers should not be casually modeled as renderer-first infrastructure unless there is a real renderer-only use case.

## Guidance for the Settings Dialog Work

The current settings dialog rebuild should follow this architecture:

- settings dialog UI lives in `features/settings`
- settings section config lives in `features/settings/config`
- settings state lives in `features/settings/model`
- shell-level open and close orchestration is triggered from `shell`
- route pages should not own settings implementation details

This keeps the settings feature isolated while still allowing the shell to expose it globally.

## Why This Structure Fits Moon

Compared with a bucket-based structure such as `components`, `services`, `store`, and `utils` at the top level, this design gives Moon:

- clearer ownership
- safer growth paths for new features
- better local reasoning when editing a feature
- fewer catch-all directories
- cleaner separation between assembly, layout, business logic, and reusable utilities

Compared with a heavier enterprise frontend architecture, this design avoids premature complexity and stays proportional to Moon's current size.

## Migration Guidance

Moon does not need a full renderer rewrite in one pass.

Recommended migration order:

1. establish the new target directory rules
2. move shell files into `shell`
3. move route-level files into `pages`
4. move settings and provider logic fully under `features`
5. replace renderer Zustand state with Redux Toolkit structure
6. gradually shrink or remove generic bucket usage as features move

This keeps migration incremental and reduces churn while feature work continues.
