# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moon is a desktop app built with Electron, React, TypeScript, electron-vite, Tailwind CSS v4, Redux Toolkit, TanStack Router, Drizzle ORM, and PGlite. The current product direction is an AI provider orchestration desktop app: Electron main owns system capabilities and persistence, preload exposes a narrow typed `window.api`, and the renderer accesses main-process capabilities only through explicit IPC contracts.

## Commands

Use `pnpm` for dependency management and scripts.

- Install dependencies: `pnpm install`
- Start Electron dev app: `pnpm dev`
- Preview built app: `pnpm start`
- Type-check both main/preload and renderer projects: `pnpm typecheck`
- Type-check Node/main side only: `pnpm typecheck:node`
- Type-check web/renderer side only: `pnpm typecheck:web`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Build app: `pnpm build`
- Build platform packages: `pnpm build:win`, `pnpm build:mac`, `pnpm build:linux`
- Build unpacked package: `pnpm build:unpack`
- Run all tests: `pnpm exec vitest run`
- Run a single test file: `pnpm exec vitest run tests/unit/main/bootstrap/register-ipc.test.ts`
- Run tests matching a name: `pnpm exec vitest run -t "settings"`
- Generate app icons from `resources/logo.png`: `pnpm build:icons`
- Update local shadcn components: `pnpm update-shadcn`

There is no dedicated `test` package script currently; call Vitest through `pnpm exec vitest run`.

## Architecture

### Process boundaries

- `src/main/` is the Electron main process. It owns app lifecycle, window creation, IPC handler registration, PGlite/Drizzle persistence, repositories, services, safe secret storage, and the local provider proxy server.
- `src/preload/` exposes the typed bridge as `window.api`. Keep this layer limited to IPC forwarding and type mapping; do not put business logic or persistence here.
- `src/renderer/src/` is the React renderer. It owns routes, shell/widgets/features/entities UI, Redux UI state, and calls main-process capabilities through `window.api`.
- `src/ipc/` is the cross-process protocol layer. Define channel constants, request/response contracts, and window IPC contracts here.
- `src/shared/domain/` contains pure cross-process domain types, defaults, validation schemas, and constants. It must stay free of Electron, React, Drizzle, and UI dependencies.
- `src/shadcn/` contains local shadcn primitives and utilities.

Main startup in `src/main/index.ts` performs app lifecycle registration, icon setup, database connection at `app.getPath('userData')/moon-pglite`, Drizzle migration bootstrap, settings repository/service wiring, provider proxy startup, IPC registration, and main window creation. Application shutdown stops the provider proxy and closes the database connection.

### IPC and settings flow

IPC channels are centralized in `src/ipc/channels.ts`; typed request/response contracts are in `src/ipc/contracts.ts`. Current settings capabilities include loading settings, creating custom providers, creating custom ACP providers, saving/deleting providers, fetching provider models, testing provider connections, saving appearance, and broadcasting `settings:on-change`. Window control capabilities include close, minimize, toggle maximize, open settings, read window state, and window state broadcasts.

The typical settings write path is:

```text
renderer feature -> window.api.settings.* -> preload typed invoke -> ipcMain handler
  -> SettingsService validation/orchestration -> SettingsRepository -> PGlite/Drizzle
  -> AppSettings response -> broadcast settings:on-change to all windows
```

API keys are handled in the main process and persisted through the settings repository. The existing `provider_settings.encrypted_api_key` column name is retained for compatibility, but new saves store the raw key value directly. The renderer receives provider state such as `hasApiKey` and `apiKey`.

### Provider integration

Provider metadata and defaults live under `src/shared/domain/provider.ts` and `src/shared/domain/settings.ts`. Provider inputs and schemas live in `src/shared/domain/settings-validation.ts`. `SettingsService` handles provider validation, model fetching, connection tests, and ACP command checks. HTTP provider tests/fetches support Anthropic-style, OpenAI chat/completions, OpenAI responses, and Google model endpoints.

`ProviderProxyServer` in `src/main/services/provider-proxy-server.ts` starts on localhost port `23002`. It exposes local OpenAI Responses and Anthropic Messages compatible proxy endpoints derived by `createProviderProxyEndpoints()` in `src/shared/domain/provider-proxy.ts`, resolves provider settings/API keys from the repository, normalizes request/response payloads, and supports simple streaming responses.

### Persistence

Persistence uses PGlite with Drizzle. Schema lives in `src/main/db/schema.ts`, migrations live in `drizzle/`, and `drizzle.config.ts` points development Drizzle Kit operations at `./.moon-pglite-dev`. Packaged apps include migrations through `electron-builder.yml` `extraResources`.

Currently active persistence centers on app settings and provider settings. Projects, sessions, and messages tables/repositories exist for future chat/session work; do not expose new IPC for them until the UI/use case is defined.

### Renderer structure

The renderer follows a Feature-Sliced-style dependency direction:

```text
app -> pages -> widgets -> features -> entities -> shared
```

- `app/` wires global providers, Redux store, TanStack Router, and route context.
- `pages/` are route-level composition surfaces.
- `widgets/` are larger composed UI blocks such as workspace shell, settings shell, and settings content.
- `features/` contain user-facing feature sections such as general settings, provider settings, settings navigation, and interface settings.
- `entities/` contain domain state/model code, currently centered on settings selectors, hooks, types, and slices.
- `shared/` contains renderer-only assets, styles, and UI primitives.

Routes are defined in `src/renderer/src/app/router/index.tsx`: `/` and `/chat` render inside `WorkspaceShell`; `/settings` renders inside `SettingsWindowShell`. The separate settings window loads the same renderer bundle with a settings hash route and optional section query.

### Styling and UI system

Global styles enter through `src/renderer/src/shared/styles/main.css`, which is also the shadcn CSS target in `components.json`. The current styling system is shadcn-first: `main.css` imports Tailwind v4, `tw-animate-css`, `shadcn/tailwind.css`, and local style layers. `theme.css` maps shadcn semantic variables to Tailwind theme slots, while `tokens.css` and `tokens.dark.css` provide Moon palette values for those slots. `recipes.css` currently only contains Electron window drag/no-drag component classes.

Prefer shadcn semantic color, background, border, and ring utilities such as `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-accent`, `text-primary`, and `ring-ring`. Ordinary Tailwind spacing, sizing, layout, typography, radius, and shadow utilities are acceptable when consistent with nearby code. Keep local shadcn primitives under `src/shadcn/ui` vendor-like; prefer call-site `className`/wrappers rather than hand-editing shadcn primitives for app-specific styling. Custom window controls must go through `window.api.windowControls`, never direct Electron access in renderer code.

## Testing

Vitest config is in `vitest.config.ts`. Tests are included from `tests/**/*.test.{ts,tsx}`. The default environment is `jsdom` with `tests/helpers/renderer/setup.ts`; Node-only main-process tests use `// @vitest-environment node` in the test file.

Test aliases include `@main`, `@preload`, `@renderer`, `@shadcn`, `@ipc`, `@shared`, and `@tests`. Tests are organized under:

- `tests/unit/main/` for main process, bootstrap, IPC, services, and window behavior.
- `tests/unit/preload/` for preload bridge behavior.
- `tests/unit/renderer/` for React pages/widgets/entities and renderer state.
- `tests/integration/main/` for PGlite, repository, and database bootstrap tests.
- `tests/helpers/` for shared test setup and helpers.

Add focused regression tests for new IPC contracts, repositories, window behavior, provider logic, and user-visible renderer changes.

## Code Style and Conventions

Formatting is defined by `.editorconfig` and `.prettierrc.yaml`: 2-space indentation, LF endings, UTF-8, single quotes, no semicolons, `printWidth: 100`, and no trailing commas.

Use the configured aliases instead of long relative imports where appropriate:

- `@ipc` for IPC channels/contracts.
- `@shared` for pure shared domain modules.
- `@main`, `@preload`, `@renderer`, `@shadcn`, and `@tests` in contexts where the relevant tsconfig/Vitest config supports them.

Keep dependency direction intact: main/preload must not import renderer code; shared domain must not import runtime/framework code; renderer `shared` is renderer-only; source code must not import from `tests`.

## Existing Guidance

`AGENTS.md` contains additional repository and collaboration guidance, including Chinese responses, addressing the user as “靓仔”, minimal/surgical changes, shadcn-first styling guidance, and conventional commit/PR notes. Preserve the project-specific technical guidance from that file when it applies, but verify paths against the current tree because some entries may be older than the current structure.
