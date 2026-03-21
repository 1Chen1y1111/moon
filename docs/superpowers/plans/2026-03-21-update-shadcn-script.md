# Update Shadcn Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DeepChat-style `scripts/update-shadcn.js` utility and expose it through `package.json` as `update-shadcn`.

**Architecture:** Introduce a single repository-local Node script under `scripts/` that batch-runs `pnpm dlx shadcn@latest add ... -o` from a manually maintained component list. Keep the structure intentionally close to the DeepChat pattern while adapting the command target to Moon's React-based `shadcn` setup.

**Tech Stack:** Node.js ESM, pnpm, shadcn CLI

---

### Task 1: Add the Script Entry Point

**Files:**
- Create: `scripts/update-shadcn.js`

- [ ] **Step 1: Verify the repository has no existing scripts directory**

Run: `rg --files . | rg "(^|/)scripts/"`
Expected: no existing local script files are listed.

- [ ] **Step 2: Create the DeepChat-style script**

Create `scripts/update-shadcn.js` with:

```js
#!/usr/bin/env node

import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const components = ['button']

function updateComponents() {
  if (components.length === 0) {
    console.log('组件列表为空，请在脚本中配置组件')
    return
  }

  console.log(`正在更新 ${components.length} 个组件: ${components.join(', ')}`)

  try {
    const command = `cd "${projectRoot}" && pnpm dlx shadcn@latest add ${components.join(' ')} -o`
    execSync(command, { stdio: 'inherit' })
    console.log('组件更新完成 ✓')
  } catch (error) {
    console.error('更新组件时出错:', error.message)
  }
}

updateComponents()
```

- [ ] **Step 3: Verify the script content**

Run: `sed -n '1,220p' scripts/update-shadcn.js`
Expected: the script uses `pnpm dlx shadcn@latest add ... -o` and keeps the DeepChat-style structure.

- [ ] **Step 4: Commit**

```bash
git add scripts/update-shadcn.js
git commit -m "feat: add update-shadcn utility script"
```

### Task 2: Register the Package Script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

Update `package.json` scripts with:

```json
"update-shadcn": "node scripts/update-shadcn.js"
```

Place it alongside the other top-level project scripts without changing unrelated entries.

- [ ] **Step 2: Verify the package script is present**

Run: `sed -n '1,120p' package.json`
Expected: `update-shadcn` points to `node scripts/update-shadcn.js`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add update-shadcn package script"
```

### Task 3: Verify Script Execution

**Files:**
- Test: `scripts/update-shadcn.js`

- [ ] **Step 1: Run the script directly**

Run: `node scripts/update-shadcn.js`
Expected: the script prints the selected component list and invokes `pnpm dlx shadcn@latest add button -o`.

- [ ] **Step 2: Run through package.json**

Run: `pnpm run update-shadcn`
Expected: the package script delegates to `node scripts/update-shadcn.js` and completes successfully.

- [ ] **Step 3: Re-run renderer typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.web.json --composite false`
Expected: no new TypeScript errors after running the script.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: verify update-shadcn script"
```
