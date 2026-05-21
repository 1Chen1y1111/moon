# Moon Development Guidelines

Guidelines for using AI coding agents in this Moon repository.

## Tech Stack

- Electron 39 + electron-vite 5 + Vite 7
- React 19 + TypeScript 5
- TanStack Router for renderer routing
- Redux Toolkit + React Redux for renderer state
- TanStack Query for async client state where needed
- Tailwind CSS v4 + shadcn/radix-nova + Radix UI + lucide-react for UI
- Drizzle ORM + PGlite for local persistence
- Vitest + React Testing Library + jsdom for tests

## Agent Workflow

Before implementing, state assumptions and success criteria when the task is not
trivial. If multiple interpretations exist, name them instead of silently picking
one. Prefer the simplest change that satisfies the request.

Avoid speculative scope:

- No features beyond what was requested.
- No abstractions for single-use code.
- No configurability that was not requested.
- No broad cleanup unless it is required by the task.

Keep changes surgical:

- Touch only files required by the task.
- Match nearby style even when another style looks cleaner.
- Do not refactor adjacent code unless the task requires it.
- Remove only imports, variables, or files made unused by your own change.
- Add concise comments only when they clarify non-obvious logic, process
  boundaries, or intent; avoid comments that merely restate the code.
- Mention unrelated dead code or risks instead of fixing them opportunistically.

For behavior changes, verify the result with focused tests. If a bug fix is
requested, prefer a regression test that fails before the fix and passes after it.
After two unsuccessful fix attempts on the same failing test, stop and ask for
help with the current evidence.

## Collaboration

- Respond to the user in Chinese.
- Address the user as "靓仔".
- Keep the tone lively, logical, and professional.
- When discussing UI/UX changes, include a small ASCII layout sketch.

## Project Structure

```plaintext
moon/
|-- src/
|   |-- main/               # Electron main process, app lifecycle, IPC handlers
|   |-- preload/            # Typed bridge exposed as window.api
|   |-- ipc/                # Cross-process channel names and IPC contracts
|   |-- shared/             # Pure shared domain code and cross-process types
|   |-- shadcn/             # Local shadcn primitives, hooks, and utilities
|   `-- renderer/
|       `-- src/
|           |-- app/        # Providers, router, route context, Redux store setup
|           |-- pages/      # Route-level composition surfaces
|           |-- layouts/    # Shells and route-level layout surfaces
|           |-- features/   # User-facing feature sections and workflows
|           |-- entities/   # Domain state, slices, selectors, and hooks
|           |-- components/ # Renderer-only reusable UI components
|           |-- assets/     # Renderer-only static assets
|           `-- styles/     # Renderer global styles and Tailwind entrypoint
|-- tests/
|   |-- unit/               # Main, preload, renderer, and boundary tests
|   |-- integration/        # PGlite, repository, and database tests
|   `-- helpers/            # Test setup and reusable helpers
|-- docs/superpowers/       # Specs and implementation plans
|-- drizzle/                # Drizzle migrations and metadata
|-- build/                  # Build-time assets
`-- resources/              # Packaged resources
```

## Process Boundaries and IPC

Moon is an Electron desktop app. Keep the process boundaries explicit.

- `src/main/` owns Electron APIs, app lifecycle, window creation, IPC handler
  registration, PGlite/Drizzle persistence, repositories, services, and provider
  proxy behavior.
- `src/preload/` exposes a narrow typed bridge as `window.api`. Keep it limited
  to IPC forwarding, bridge shape, and type mapping.
- `src/ipc/` is the contract layer. Add channel constants and request/response
  contracts here before wiring main/preload/renderer behavior.
- `src/shared/` is for pure cross-process domain code. It must not depend on
  Electron, React, Drizzle runtime code, or renderer-only modules.
- `src/renderer/src/` owns React UI, renderer state, routes, and calls into main
  only through `window.api`.

Typical write flow:

```plaintext
renderer feature -> window.api.* -> preload typed invoke -> ipcMain handler
  -> service validation/orchestration -> repository -> PGlite/Drizzle
  -> typed response -> optional broadcast back to renderer windows
```

Custom window controls must go through `window.api.windowControls`; do not call
Electron directly from renderer code.

## Renderer Routes and Features

The renderer follows this dependency direction:

```plaintext
app -> pages -> layouts -> features -> entities -> components/assets/styles
```

- `src/renderer/src/app/` wires global providers, router, route context, and the
  Redux store.
- `src/renderer/src/pages/` should stay thin. Use pages for route-level
  composition and delegate shell surfaces to layouts or reusable behavior to
  features and entities.
- `src/renderer/src/layouts/` contains route/window shells such as workspace
  shell and settings shell.
- `src/renderer/src/features/` contains feature workflows such as provider
  settings, general settings, and interface settings.
- `src/renderer/src/entities/` contains domain model code, selectors, slices,
  hooks, and entity-level types.
- `src/renderer/src/components/` contains renderer-only reusable UI components.
  Component folders use `PascalCase`, for example `ProviderCatalogIcon`.
- `src/renderer/src/assets/` contains renderer-only static assets.
- `src/renderer/src/styles/` contains renderer global styles and the Tailwind
  entrypoint. Do not import renderer-only files from main, preload, IPC
  contracts, or shared domain modules.

When adding or changing renderer routes:

1. Register the route in `src/renderer/src/app/router/index.tsx`.
2. Put route host composition in `src/renderer/src/app/router/route-hosts.tsx`
   when the route needs a shell boundary.
3. Add or update the page under `src/renderer/src/pages/`.
4. Move reusable chunks into `layouts/`, `features/`, `entities/`, or
   renderer-only `components/` instead of growing route files.
5. Update focused router/page tests under `tests/unit/renderer/`.

Current route behavior: `/` and `/chat` render inside the workspace shell, while
`/settings` renders inside the settings window shell. The settings window uses the
same renderer bundle and is opened through the window-control IPC bridge.

## Moon Design System

The renderer styling system is shadcn-first, with Moon palette values feeding
shadcn semantic CSS variables.

Use `src/renderer/src/styles/` as the source of truth for global styling:

- `main.css` is the Tailwind v4 entrypoint and imports `tailwindcss`,
  `tw-animate-css`, `shadcn/tailwind.css`, and local theme/token/style layers.
- `theme.css` maps shadcn semantic slots into Tailwind theme colors such as
  `background`, `foreground`, `card`, `popover`, `primary`, `secondary`,
  `muted`, `accent`, `destructive`, `border`, `input`, `ring`, sidebar slots,
  and chart slots.
- `tokens.css` and `tokens.dark.css` provide the Moon brand palette behind those
  semantic variables.
- `recipes.css` currently contains Electron window drag/no-drag component
  classes only.
- `components.json` points shadcn at `src/renderer/src/styles/main.css`
  with `cssVariables: true` and `iconLibrary: lucide`.

For UI styling, prefer shadcn semantic utilities such as `bg-background`,
`bg-card`, `bg-secondary`, `bg-accent`, `text-foreground`,
`text-muted-foreground`, `text-primary`, `border-border`, `border-input`, and
`ring-ring`. Ordinary Tailwind layout, spacing, sizing, typography, radius, and
shadow utilities are fine when they match nearby code.

Use local shadcn primitives from `src/shadcn/ui/*`. Do not hand-edit those files
for app-specific styling; compose at call sites with `className`, `cn(...)`, or
wrappers outside `src/shadcn/ui/*`. Regenerate primitives only with shadcn
tooling.

Do not assume general-purpose `.moon-*` recipes such as cards, tags, quotes, code
blocks, or typography utilities exist unless they are present in the current CSS.

When a UI/UX change is requested, briefly sketch the intended layout with an ASCII
diagram in conversation or PR notes. For screenshots or visual comparisons, keep
the logo unchanged unless the user explicitly asks to modify it.

## Development

### Package Management

Use `pnpm` for dependency management and scripts.

```bash
pnpm install
pnpm update-shadcn
```

### Starting the App

```bash
# Electron development app
pnpm dev

# Preview the built app through electron-vite
pnpm start
```

### Build and Type Check

```bash
# Type-check both main/preload and renderer projects
pnpm typecheck

# Type-check Node/main side only
pnpm typecheck:node

# Type-check web/renderer side only
pnpm typecheck:web

# Build the app
pnpm build

# Platform packages
pnpm build:win
pnpm build:mac
pnpm build:linux

# Unpacked package
pnpm build:unpack
```

`pnpm build` runs type checks before `electron-vite build`. Platform package
commands build through Electron Builder.

### Lint and Format

```bash
pnpm lint
pnpm format
```

Follow `.editorconfig` and `.prettierrc.yaml`: 2-space indentation, LF endings,
UTF-8, single quotes, no semicolons, `printWidth: 100`, and no trailing commas.

Use TypeScript for source files. React components use `PascalCase.tsx`; tests live
under `tests/` with source-mirroring folders. Keep slices named `*.slice.ts`,
selectors as `*.selectors.ts`, and type modules as `*.types.ts`.

Prefer configured aliases where available: `@main`, `@preload`, `@renderer`,
`@shadcn`, `@ipc`, `@shared`, and `@tests`.

### Testing

There is no dedicated `test` script currently; call Vitest through `pnpm exec`.

```bash
# Full suite
pnpm exec vitest run

# Single file
pnpm exec vitest run tests/unit/main/bootstrap/register-ipc.test.ts

# Matching a test name
pnpm exec vitest run -t "settings"
```

Vitest uses `jsdom`, globals, and `tests/helpers/renderer/setup.ts` by default.
Node-only main-process tests use `// @vitest-environment node` in the test file.
`tsconfig.test.json` and `vitest.config.ts` provide test-only alias coverage.

Test placement:

- `tests/unit/main/` for Electron main process, bootstrap, IPC, services,
  repositories, and window behavior.
- `tests/unit/preload/` for bridge behavior.
- `tests/unit/renderer/` for React pages, layouts, entities, state, and router
  behavior.
- `tests/integration/main/` for PGlite, repository, and database bootstrap tests.
- `tests/helpers/` for shared test setup and helpers.

Add focused regression tests for new IPC contracts, repository behavior,
provider logic, shell/window behavior, and user-facing renderer changes. Keep
coverage proportional to risk.

## Persistence and Provider Behavior

Persistence uses PGlite with Drizzle. Schema lives in `src/main/db/schema.ts`,
runtime connection/bootstrap code lives in `src/main/db/`, repositories live under
`src/main/repositories/`, and migrations live in `drizzle/`.

Provider defaults and validation belong in shared domain modules. Main-process
services should validate and orchestrate provider operations before repositories
persist them. Renderer code should treat provider and settings behavior as typed
IPC capabilities exposed by `window.api`.

Do not expose new database-backed IPC routes until the renderer use case and
contract shape are clear.

## Git and Pull Requests

Git history uses Conventional Commit-style prefixes such as `feat:`, `fix:`,
`refactor:`, `test:`, `docs:`, and `chore:`. Keep subjects short, lower-case, and
imperative, for example:

```plaintext
fix: remove settings window outer scrolling
```

Pull requests should include a summary, linked issue or plan when applicable,
test results, and screenshots for UI changes. Note platform-specific Electron
behavior, packaging impact, IPC contract changes, and database/schema implications.

## Security and Configuration

Do not commit local secrets, provider API keys, generated packages, `out/`, or
`dist/`.

Keep IPC exposure narrow: define contracts in `src/ipc/`, expose only required
preload APIs, and validate external input before it reaches repositories or
services. Keep renderer imports free of Electron/main-process APIs.

## Code Review

For review requests, prioritize bugs, regressions, security issues, missing tests,
and boundary violations. Lead with findings ordered by severity and include file
and line references. If no issues are found, say so clearly and mention remaining
test gaps or residual risk.
