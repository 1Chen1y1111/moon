# Repository Guidelines

## Project Structure & Module Organization

This is an Electron + React + TypeScript app built with electron-vite.

- `src/main/` contains the Electron main process, including window bootstrapping, IPC, database setup, repositories, and services.
- `src/preload/` contains preload entry points and exposed bridge types.
- `src/renderer/src/` contains the React renderer app: `app/` for providers, router, and store setup; `pages/` for route surfaces; `features/` for domain UI and state; `shell/` for app chrome; `assets/` for global CSS.
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

Use TypeScript for source files. React components use `PascalCase.tsx`; tests colocate as `*.test.ts` or `*.test.tsx`. Keep slices named `*.slice.ts`, selectors as `*.selectors.ts`, and type modules as `*.types.ts`. Prefer aliases such as `@renderer`, `@shadcn`, and `@shared`.

## Testing Guidelines

Vitest uses `jsdom`, globals, and `src/renderer/src/test/setup.ts`. Test files are included from `src/renderer/src/**/*.test.{ts,tsx}` and `src/main/**/*.test.ts`.

Add focused regression tests for IPC contracts, repository behavior, shell/window behavior, and user-facing renderer changes. No coverage threshold is configured, so keep coverage proportional to change risk.

## Commit & Pull Request Guidelines

Git history uses Conventional Commit-style prefixes such as `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, and `chore:`. Keep subjects short, lower-case, and imperative, for example `fix: remove settings window outer scrolling`.

Pull requests should include a summary, linked issue or plan, test results, and screenshots for UI changes. Note platform-specific Electron behavior, packaging impact, or database/schema implications.

## Security & Configuration Tips

Do not commit local secrets, provider API keys, generated packages, `out/`, or `dist/`. Keep IPC exposure narrow: define contracts in `src/main/ipc/`, expose only required preload APIs, and validate external input before it reaches repositories or services.
