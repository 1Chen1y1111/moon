# moon

Moon is a pnpm monorepo. The Electron desktop application lives in
`apps/desktop`; shared domain code, IPC contracts, and local UI primitives live
under `packages`.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

This delegates to the `@moon/desktop` workspace package.

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

### Test

```bash
$ pnpm test
```

Tests live under `tests/`:

- `tests/unit/` for main/preload/renderer unit and boundary tests.
- `tests/integration/` for SQLite, repository, and database bootstrap tests.
- `tests/helpers/` for shared test setup and helpers.

`tsconfig.test.json` provides TypeScript alias support for the centralized test tree.
