# Repository Guidelines

## Project Structure & Module Organization

This is an Electron + React + TypeScript app built with electron-vite.

- `src/main/` contains the Electron main process, including window bootstrapping, IPC, database setup, repositories, and services.
- `src/preload/` contains preload entry points and exposed bridge types.
- `src/renderer/src/` contains the React renderer app: `app/` for providers, router, and store setup; `pages/` for route surfaces; `features/` for domain UI and state; `shell/` for app chrome; `shared/styles/` for global CSS; `shared/assets/` for static assets.
- `src/shadcn/` contains local shadcn UI primitives and utilities.
- `docs/superpowers/` stores specs and plans.
- Build assets live in `build/`; packaged resources live in `resources/`.

## Build, Test, and Development Commands

Use `pnpm` for dependency management.

- `pnpm install` installs dependencies.
- `pnpm dev` starts the Electron development app.
- `pnpm start` previews the built app through electron-vite.
- `pnpm build` runs TypeScript checks and builds the app.
- `pnpm build:mac`, `pnpm build:win`, and `pnpm build:linux` create platform packages.
- `pnpm lint` runs ESLint with cache.
- `pnpm format` formats the repository with Prettier.
- `pnpm exec vitest run` runs the test suite. There is no dedicated `test` script currently.

## Coding Style & Naming Conventions

Follow `.editorconfig` and Prettier: 2-space indentation, LF endings, UTF-8, single quotes, no semicolons, `printWidth: 100`, and no trailing commas.

Use TypeScript for source files. React components use `PascalCase.tsx`; tests live under `tests/` with source-mirroring folders. Keep slices named `*.slice.ts`, selectors as `*.selectors.ts`, and type modules as `*.types.ts`. Prefer aliases such as `@renderer`, `@shadcn`, `@ipc`, `@main`, and `@tests`.

## Moon Design System

The renderer follows the Moon design system: warm parchment surfaces, ink-blue focus,
warm neutral grays, serif authority for headings, and no hard drop shadows. This is a
typeset document aesthetic, not a dashboard aesthetic.

Use `src/renderer/src/shared/styles/` as the source of truth for global styling:
`main.css` is the Tailwind entrypoint, `theme.css` maps Tailwind v4 tokens,
`tokens.css` and `tokens.dark.css` define Moon variables, and `recipes.css` contains
`.moon-*` component recipes. Prefer existing `moon-*` tokens and `.moon-*` recipes
before adding new values. Do not introduce `kami-*` names; this project uses
`moon-*` only.

For UI styling, avoid raw Tailwind visual scale utilities when a Moon token exists:
do not add `text-sm`, `text-xs`, `text-lg`, `leading-6`, `gap-3`, `px-6`, `py-4`,
`font-medium`, `rounded-md`, or similar hard-coded visual choices in app UI. Use the
Moon typography, spacing, weight, radius, color, and shadow tokens instead, such as
`text-moon-body`, `text-moon-h2`, `leading-moon-body`, `gap-moon-md`,
`px-moon-panel`, `font-moon-title`, and `rounded-moon-control`.

Typography rules:

- Serif headings use weight 500 through `font-moon-title`; do not use bold serif.
- UI labels, metadata, controls, and body text use sans.
- Use the role-based type tokens: `text-moon-display`, `text-moon-h1-section`,
  `text-moon-h2`, `text-moon-h3`, `text-moon-body-lead`, `text-moon-body`,
  `text-moon-body-dense`, `text-moon-caption`, `text-moon-label`, and `text-moon-tiny`.
- Use the matching `leading-moon-*` tokens. Do not use line-height values above 1.55.
- Do not use italic. The stylesheet normalizes italic elements to `font-style: normal`.

Color and depth rules:

- Light mode uses parchment `#f5f4ed`, ivory surfaces, warm neutral grays, and ink blue
  `#1B365D` as the only accent color.
- Keep ink blue visually sparse; it should mark focus, selection, and primary actions.
- Tag and badge backgrounds must use solid token colors such as `.moon-tag`,
  `.moon-tag-standard`, and `.moon-tag-strong`; do not use ad hoc translucent tag colors.
- Use ring or whisper shadows (`shadow-moon-ring`, `shadow-moon-whisper`,
  `shadow-moon-shell`, `shadow-moon-menu-hover`) instead of hard drop shadows.
- Dark mode is an explicit exception: it preserves the previous dark palette under the
  `.dark` token overrides. Do not warm-shift dark mode unless the user asks.

Component recipes already exist for common document surfaces:

- Cards: `.moon-card`, `.moon-card-featured`
- Tags: `.moon-tag`, `.moon-tag-standard`, `.moon-tag-strong`, `.moon-tag-brush`
- Quotes and code: `.moon-quote`, `.moon-code-block`, `.moon-code-card`
- Section starts: `.moon-section-title`, `.moon-section-header`
- Metrics, print, and slides: `.moon-metrics`, `.moon-page-break`, `.moon-slide`,
  `.moon-slide-footer`

When a UI/UX change is requested, briefly sketch the intended layout with an ASCII
diagram in the conversation or PR notes. For screenshots or visual comparisons, keep
the logo unchanged unless the user explicitly asks to modify it.

## Testing Guidelines

Vitest uses `jsdom`, globals, and `tests/helpers/renderer/setup.ts`. Test files are included from `tests/**/*.test.{ts,tsx}`, and `tsconfig.test.json` provides test-only TypeScript alias coverage. Put unit tests under `tests/unit/`, repository/database tests under `tests/integration/`, and shared test helpers under `tests/helpers/`.

Add focused regression tests for IPC contracts, repository behavior, shell/window behavior, and user-facing renderer changes. No coverage threshold is configured, so keep coverage proportional to change risk.

## Commit & Pull Request Guidelines

Git history uses Conventional Commit-style prefixes such as `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, and `chore:`. Keep subjects short, lower-case, and imperative, for example `fix: remove settings window outer scrolling`.

Pull requests should include a summary, linked issue or plan, test results, and screenshots for UI changes. Note platform-specific Electron behavior, packaging impact, or database/schema implications.

## Security & Configuration Tips

Do not commit local secrets, provider API keys, generated packages, `out/`, or `dist/`. Keep IPC exposure narrow: define contracts in `src/main/ipc/`, expose only required preload APIs, and validate external input before it reaches repositories or services.
