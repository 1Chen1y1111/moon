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
|-- apps/
|   `-- electron/
|       |-- src/
|       |   |-- main/       # Electron main process, app lifecycle, IPC handlers
|       |   |-- preload/    # Typed bridge exposed as window.api
|       |   |-- ipc/        # Cross-process channel names and IPC contracts
|       |   `-- renderer/
|       |       `-- src/    # React renderer app
|       |-- tests/          # Main, preload, renderer, and integration tests
|       |-- drizzle/        # Drizzle migrations and metadata
|       |-- build/          # Build-time assets
|       `-- resources/      # Packaged resources
|-- packages/
|   |-- core/               # Pure session, message, usage, and agent event types
|   |-- shared/             # Pure shared domain code, validation, agent/config boundaries
|   `-- ui/                 # Local shadcn primitives, hooks, and utilities
|-- docs/superpowers/       # Specs and implementation plans
|-- package.json            # Workspace root metadata only
`-- pnpm-workspace.yaml     # apps/* and packages/* workspace definition
```

## Process Boundaries and IPC

Moon is an Electron desktop app. Keep the process boundaries explicit.

- `apps/electron/src/main/` owns Electron APIs, app lifecycle, window creation, IPC handler
  registration, PGlite/Drizzle persistence, repositories, services, and provider
  proxy behavior.
- `apps/electron/src/preload/` exposes a narrow typed bridge as `window.api`. Keep it limited
  to IPC forwarding, bridge shape, and type mapping.
- `apps/electron/src/ipc/` is the contract layer. Add channel constants and request/response
  contracts here before wiring main/preload/renderer behavior.
- `packages/core/src/` is for pure core session, message, usage, and agent event types. It must
  not depend on Electron, React, Drizzle, Zod, concrete SDKs, or renderer-only modules.
- `packages/shared/src/` is for pure cross-process domain code, validation, and
  `agent/config` boundaries. It must not depend on
  Electron, React, Drizzle runtime code, or renderer-only modules.
- `apps/electron/src/renderer/src/` owns React UI, renderer state, routes, and calls into main
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

- `apps/electron/src/renderer/src/app/` wires global providers, router, route context, and the
  Redux store.
- `apps/electron/src/renderer/src/pages/` should stay thin. Use pages for route-level
  composition and delegate shell surfaces to layouts or reusable behavior to
  features and entities.
- `apps/electron/src/renderer/src/layouts/` contains route/window shells such as workspace
  shell and settings shell.
- `apps/electron/src/renderer/src/features/` contains feature workflows such as provider
  settings, general settings, and interface settings.
- `apps/electron/src/renderer/src/entities/` contains domain model code, selectors, slices,
  hooks, and entity-level types.
- `apps/electron/src/renderer/src/components/` contains renderer-only reusable UI components.
  Component folders use `PascalCase`, for example `ProviderCatalogIcon`.
- `apps/electron/src/renderer/src/assets/` contains renderer-only static assets.
- `apps/electron/src/renderer/src/styles/` contains renderer global styles and the Tailwind
  entrypoint. Do not import renderer-only files from main, preload, IPC
  contracts, or shared domain modules.

When adding or changing renderer routes:

1. Register the route in `apps/electron/src/renderer/src/app/router/index.tsx`.
2. Put route host composition in `apps/electron/src/renderer/src/app/router/route-hosts.tsx`
   when the route needs a shell boundary.
3. Add or update the page under `apps/electron/src/renderer/src/pages/`.
4. Move reusable chunks into `layouts/`, `features/`, `entities/`, or
   renderer-only `components/` instead of growing route files.
5. Update focused router/page tests under `apps/electron/tests/unit/renderer/`.

Current route behavior: `/` and `/chat` render inside the workspace shell, while
`/settings` renders inside the settings window shell. The settings window uses the
same renderer bundle and is opened through the window-control IPC bridge.

## Moon Design System

The renderer styling system is shadcn-first, with Moon palette values feeding
shadcn semantic CSS variables.

Use `apps/electron/src/renderer/src/styles/` as the source of truth for global styling:

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
- `components.json` points shadcn at `apps/electron/src/renderer/src/styles/main.css`
  with `cssVariables: true` and `iconLibrary: lucide`.

For UI styling, prefer shadcn semantic utilities such as `bg-background`,
`bg-card`, `bg-secondary`, `bg-accent`, `text-foreground`,
`text-muted-foreground`, `text-primary`, `border-border`, `border-input`, and
`ring-ring`. Ordinary Tailwind layout, spacing, sizing, typography, radius, and
shadow utilities are fine when they match nearby code.

Use local shadcn primitives from `packages/ui/src/ui/*`. Do not hand-edit those files
for app-specific styling; compose at call sites with `className`, `cn(...)`, or
wrappers outside `packages/ui/src/ui/*`. Regenerate primitives only with shadcn
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
pnpm --filter @moon/electron update-shadcn
```

### Starting the App

```bash
# Electron development app
pnpm --filter @moon/electron dev

# Preview the built app through electron-vite
pnpm --filter @moon/electron start
```

### Build and Type Check

```bash
# Type-check both main/preload and renderer projects
pnpm --filter @moon/electron typecheck

# Type-check Node/main side only
pnpm --filter @moon/electron typecheck:node

# Type-check web/renderer side only
pnpm --filter @moon/electron typecheck:web

# Type-check shared packages
pnpm --filter @moon/core typecheck
pnpm --filter @moon/shared typecheck
pnpm --filter @moon/ui typecheck

# Build the app
pnpm --filter @moon/electron build

# Platform packages
pnpm --filter @moon/electron build:win
pnpm --filter @moon/electron build:mac
pnpm --filter @moon/electron build:linux

# Unpacked package
pnpm --filter @moon/electron build:unpack
```

`pnpm --filter @moon/electron build` runs type checks before `electron-vite build`.
Platform package commands build through Electron Builder.

### Lint and Format

```bash
pnpm --filter @moon/electron lint
pnpm --filter @moon/electron format
```

Follow `.editorconfig` and `.prettierrc.yaml`: 2-space indentation, LF endings,
UTF-8, single quotes, no semicolons, `printWidth: 100`, and no trailing commas.

Use TypeScript for source files. React components use `PascalCase.tsx`; Electron
tests live under `apps/electron/tests/` and shared-domain tests live under
`packages/shared/tests/`. Keep slices named `*.slice.ts`, selectors as
`*.selectors.ts`, and type modules as `*.types.ts`.

Prefer configured aliases where available: `@main`, `@preload`, `@renderer`,
`@ipc`, `@tests`, `@moon/core`, `@moon/shared`, and `@moon/ui`.

## 代码注释与文件职责

适用于 `.ts`、`.tsx`、`.js`、`.jsx`、`.mjs`、`.cjs` 源码文件。测试文件、配置文件、
类型声明文件、生成文件可以按实际复杂度处理；除非文件内有非显然流程，否则不强制补齐
每个辅助函数。

- 每个源码文件顶部必须有一段文件级 JSDoc，1-2 句中文说明这个文件的主要职责和边界。
- 文件级 JSDoc 放在 imports 之前；如果文件有 shebang，放在 shebang 之后；如果文件
  需要 `'use client'` 或 `'use strict'` 指令，指令必须保持在最顶部，文件级 JSDoc 放在
  指令之后。
- 修改文件职责时，必须同步更新文件顶部职责说明。
- 每个导出的函数、类、类方法、React 组件、hook、store action、事件处理函数，以及非
  显然的私有辅助函数，都必须写简短中文 JSDoc。
- 函数和方法的 JSDoc 重点说明它在流程中的职责、调用边界、输入输出语义、状态变化，
  或容易误解的副作用。
- 简单 getter 也要用一句话说明它对外暴露的业务含义。
- 注释统一使用中文；英文只用于协议字段名、库名、类型名、错误码、命令或外部 API 原文。
- 注释重点解释设计意图、边界条件、协议差异、异步流程、状态机、取消/重试语义、
  Electron 进程边界、终端兼容、IME/光标等容易踩坑的地方。
- 不要给显而易见的赋值、普通导入、简单 JSX 结构、无分支透传逻辑写注释。
- 不写作者、日期、变更记录、版权头，避免过期维护成本。
- IPC、SDK adapter、subprocess protocol、持久化迁移、跨进程 bridge 相关代码，必须在
  拥有协议边界的函数或类型附近说明 wire contract 和生命周期假设。

示例：

```ts
/**
 * 负责注册设置相关 IPC handler，边界止于请求分发和事件广播。
 * 具体业务校验和持久化由 settings service/repository 承担。
 */

import { ipcMain } from 'electron'

/**
 * 注册设置窗口需要的 IPC handler，并把 renderer 请求转交给 settings service。
 */
export function registerSettingsHandlers(): void {
  // ...
}
```

### Testing

Use package-local test scripts through workspace filters.

```bash
# Electron app suite
pnpm --filter @moon/electron test

# Shared-domain suite
pnpm --filter @moon/shared test

# Single Electron test file
pnpm --filter @moon/electron exec vitest run tests/unit/main/bootstrap/register-ipc.test.ts

# Matching a test name
pnpm --filter @moon/electron exec vitest run -t "settings"
```

Electron Vitest uses `jsdom`, globals, and
`apps/electron/tests/helpers/renderer/setup.ts` by default. Node-only
main-process tests use `// @vitest-environment node` in the test file.
`apps/electron/tsconfig.test.json` and `apps/electron/vitest.config.ts` provide
test-only alias coverage.

Test placement:

- `apps/electron/tests/unit/main/` for Electron main process, bootstrap, IPC, services,
  repositories, and window behavior.
- `apps/electron/tests/unit/preload/` for bridge behavior.
- `apps/electron/tests/unit/renderer/` for React pages, layouts, entities, state, and router
  behavior.
- `apps/electron/tests/integration/main/` for PGlite, repository, and database bootstrap tests.
- `apps/electron/tests/helpers/` for Electron test setup and helpers.
- `packages/shared/tests/` for pure shared-domain tests.

Add focused regression tests for new IPC contracts, repository behavior,
provider logic, shell/window behavior, and user-facing renderer changes. Keep
coverage proportional to risk.

## Persistence and Provider Behavior

Persistence uses PGlite with Drizzle. Schema lives in `apps/electron/src/main/db/schema.ts`,
runtime connection/bootstrap code lives in `apps/electron/src/main/db/`, repositories live under
`apps/electron/src/main/repositories/`, and migrations live in `apps/electron/drizzle/`.

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

Keep IPC exposure narrow: define contracts in `apps/electron/src/ipc/`, expose only required
preload APIs, and validate external input before it reaches repositories or
services. Keep renderer imports free of Electron/main-process APIs.

## Code Review

For review requests, prioritize bugs, regressions, security issues, missing tests,
and boundary violations. Lead with findings ordered by severity and include file
and line references. If no issues are found, say so clearly and mention remaining
test gaps or residual risk.
