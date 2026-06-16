# moon

Electron + React + TypeScript desktop app, organized as a pnpm monorepo.

## Workspace

```text
moon/
  apps/electron/      Electron desktop app
  packages/core/      Pure core session, message, usage, and agent event types
  packages/shared/    Pure shared domain types, validation, and defaults
  packages/ui/        Local shadcn and ai-elements primitives
```

## Install

```bash
pnpm install
```

## Development

Use explicit workspace filters from the repo root.

```bash
pnpm --filter @moon/electron dev
pnpm --filter @moon/electron start
```

## Build

```bash
pnpm --filter @moon/electron build
pnpm --filter @moon/electron build:win
pnpm --filter @moon/electron build:mac
pnpm --filter @moon/electron build:linux
```

## Checks

```bash
pnpm --filter @moon/core typecheck
pnpm --filter @moon/shared typecheck
pnpm --filter @moon/shared test
pnpm --filter @moon/ui typecheck
pnpm --filter @moon/electron typecheck
pnpm --filter @moon/electron test
```

Electron tests live under `apps/electron/tests/`. Shared-domain tests live under
`packages/shared/tests/`.
