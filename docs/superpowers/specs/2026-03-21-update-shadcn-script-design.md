# Update Shadcn Script Design

## Overview

This document defines a DeepChat-inspired `update-shadcn` script for the Moon repository.

The goal is to keep the script structure very close to the script pattern used in DeepChat while adapting the command to Moon's actual React-based `shadcn` setup.

## Goal

Add a repository-local script that can batch-run `shadcn` component updates from a maintained component list.

The script should:

- live under `scripts/`
- be easy to edit by hand
- batch-update primitives through a single command
- stay aligned with the current React `shadcn` integration

## Project Context

Moon now uses a React-oriented `shadcn` foundation under:

```text
src/shadcn/
```

The repository currently has no `scripts/` directory, so this script will establish the initial convention for local utility scripts.

The recent `shadcn` reinitialization already set:

- `components.json`
- `@shadcn/*` aliases
- `src/shadcn/ui/button.tsx`
- `src/shadcn/lib/utils.ts`

## Core Decision

We will not copy DeepChat's command literally.

DeepChat's example shape uses:

```bash
pnpm dlx shadcn-vue@latest add ...
```

Moon must instead use:

```bash
pnpm dlx shadcn@latest add ...
```

This is the only intentional behavior change from the DeepChat-style pattern.

## Recommended Approach

Add a single file:

```text
scripts/update-shadcn.js
```

The file should preserve the recognizable DeepChat-style structure:

- shebang header
- `execSync` usage
- `projectRoot` calculation
- hard-coded `components` array
- one function that runs a batch command
- simple console output

## Script Shape

The script should follow this behavior:

1. Resolve `projectRoot` from the current script file
2. Read a manually maintained `components` array
3. If the array is empty, print a message and exit
4. Print which components are about to be updated
5. Run:

```bash
pnpm dlx shadcn@latest add <components...> -o
```

6. Stream command output directly to the terminal
7. Print success or failure messaging

## Initial Component List

The initial list should stay minimal:

```js
const components = ['button']
```

This keeps the script consistent with the current repository state and gives a safe default example for future updates.

## Package Script

Add a package script for convenience:

```json
"update:shadcn": "node scripts/update-shadcn.js"
```

This allows either of these execution styles:

```bash
node scripts/update-shadcn.js
pnpm run update:shadcn
```

## Scope Boundaries

This script should only batch-run `shadcn add`.

It should not:

- patch generated code
- rewrite imports
- run tests automatically
- format files automatically
- detect components dynamically

Those concerns can be added later if real maintenance pressure appears, but they are intentionally out of scope for this first version.

## Why This Design

### Why not copy DeepChat literally

DeepChat's exact script target does not match Moon's stack. Literal copying would produce a Vue-oriented command in a React-oriented codebase.

### Why keep the structure close anyway

The user explicitly wants the same mental model:

- edit a component list
- run one script
- batch refresh primitives

Keeping the structure familiar satisfies that goal while preserving correctness.

### Why not add automation now

Moon currently has very few `shadcn` primitives. A minimal script is enough and avoids premature complexity.

## Success Criteria

This work is successful when:

- `scripts/update-shadcn.js` exists
- `package.json` exposes `update:shadcn`
- the script runs `pnpm dlx shadcn@latest add ... -o`
- the script works from the repository root
- the script can update the declared component list without manual command assembly

## Recommended Next Step

Create an implementation plan covering:

- new `scripts/` directory creation
- script file creation
- `package.json` script registration
- execution verification
