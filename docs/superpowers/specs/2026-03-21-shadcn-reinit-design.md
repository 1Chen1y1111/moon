# Shadcn Reinitialization Design

## Overview

This document defines how Moon should reinitialize `shadcn/ui` in the current Electron + Vite codebase.

The goal is not to mirror DeepChat literally. The goal is to borrow its directory naming preference while preserving clean Electron process boundaries and a maintainable renderer UI architecture.

## Goal

Rebuild the current pseudo-`shadcn` foundation using the official `shadcn` CLI so that:

- generated primitives come from the official toolchain
- future `shadcn add ...` commands work reliably
- UI foundation stays isolated from renderer feature code
- Electron `main`, `preload`, and shared contracts remain cleanly separated

## Project Context

The current repository is a single-package Electron application with Vite for the renderer.

Current high-level process layout:

- `src/main`
- `src/preload`
- `src/renderer/src`

There is already an AI-authored pseudo-`shadcn` setup:

- `components.json`
- `src/renderer/src/components/ui/*`
- `src/renderer/src/lib/utils.ts`

This setup looks similar to `shadcn`, but it is not trusted as the canonical foundation for future CLI-driven component generation.

## Constraints

- The repository is not a monorepo
- The user wants to keep the name `shadcn`
- `shadcn` should not become a business-component bucket
- The renderer remains the only consumer of the `shadcn` layer
- `main`, `preload`, and `shared` must not depend on React UI primitives

## Recommended Architecture

The root source layout should be:

```text
src/
├─ main/
├─ preload/
├─ renderer/
├─ shared/
├─ types/
└─ shadcn/
```

### Responsibilities

- `src/main`: Electron main process, runtime orchestration, persistence, IPC handlers
- `src/preload`: secure bridge APIs exposed to the renderer
- `src/renderer`: app composition, routes, features, screens, business components
- `src/shared`: IPC contracts, schemas, DTOs, constants
- `src/types`: ambient declarations only
- `src/shadcn`: renderer-only primitive UI foundation generated and maintained through `shadcn`

## Shadcn Layer Rules

`src/shadcn` is a vendor-like UI foundation layer.

Allowed contents:

- `ui/*` primitives such as `button`, `input`, `dialog`, `sheet`
- `lib/utils.ts`
- variant helpers
- narrowly scoped style helpers needed by generated primitives

Disallowed contents:

- feature components
- page components
- business dialogs such as `ProviderSetupDialog`
- app-specific widgets such as chat composers or settings panels
- shared business types or IPC contracts

In practice:

```text
src/shadcn/
├─ ui/
├─ lib/
└─ styles/      # optional
```

## Why Not Other Structures

### Why not `--monorepo`

The current repository is a single package and has no workspace root such as `pnpm-workspace.yaml`.

The official `shadcn` monorepo flow is unnecessary overhead for this project at this stage.

### Why not put primitives under `src/renderer/components/ui`

That layout works technically, but it weakens the distinction between:

- generated primitive design-system components
- app-owned reusable components

The user explicitly wants a dedicated `shadcn` layer name, so this design preserves that preference without letting it leak across process boundaries.

### Why not make `src/shadcn` a general UI layer

If `src/shadcn` becomes a broad UI bucket, it will gradually absorb feature-specific components and lose architectural meaning.

The directory must stay narrow and disciplined.

## CLI Strategy

The reinitialization should use the official Vite entrypoint:

```bash
pnpm dlx shadcn@latest init -t vite --force
```

Rationale:

- `-t vite` matches the renderer build tool
- `--force` is appropriate because the repository already contains a pseudo-`shadcn` setup that should be replaced

After initialization, the first primitive should be added explicitly:

```bash
pnpm dlx shadcn@latest add button
```

This validates that the CLI output path, aliases, and dependency wiring are correct.

## Initialization-Time Configuration

During `init`, the configuration should be aligned to the agreed structure.

Expected alias mapping:

```json
{
  "components": "@shadcn",
  "ui": "@shadcn/ui",
  "utils": "@shadcn/lib/utils",
  "lib": "@shadcn/lib"
}
```

Expected CSS entry:

```text
src/renderer/src/assets/main.css
```

## Alias Design

The codebase should support these import paths:

```text
@renderer/* -> src/renderer/src/*
@shared/*   -> src/shared/*
@shadcn/*   -> src/shadcn/*
```

This keeps renderer business code and primitive imports distinct:

```ts
import { Button } from '@shadcn/ui/button'
import { cn } from '@shadcn/lib/utils'
```

## Replacement Strategy

The current pseudo-`shadcn` artifacts should be removed before or as part of reinitialization.

Primary replacement targets:

- existing `components.json`
- existing renderer-local pseudo-primitive files under `src/renderer/src/components/ui/*`
- existing renderer-local utility file currently acting as `shadcn` utility glue

The migration should not try to refactor feature components at the same time.

Recommended order:

1. remove pseudo-`shadcn` foundation files
2. initialize official `shadcn`
3. add `button`
4. update renderer imports from old pseudo paths to `@shadcn/*`
5. verify future `add` commands such as `dialog` and `input` work without manual cleanup

## Migration Boundary

This effort should only rebuild the UI foundation layer.

It should not include:

- redesigning renderer features
- restructuring IPC contracts
- moving business components into new directories
- introducing monorepo packaging

## Success Criteria

The reinitialization is successful when all of the following are true:

- `shadcn init` completes with the agreed aliases and CSS path
- `shadcn add button` generates files under `src/shadcn`
- renderer code can import primitives from `@shadcn/*`
- existing feature code no longer depends on the pseudo-`shadcn` paths
- future `shadcn add ...` commands can be executed without custom manual patching

## Recommended Next Step

Once this design is approved, create an implementation plan covering:

- alias updates
- file removals
- CLI reinitialization
- first primitive generation
- import migration
- validation steps
