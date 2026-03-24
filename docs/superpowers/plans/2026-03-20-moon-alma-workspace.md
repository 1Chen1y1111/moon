# Moon Alma Workspace V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Alma-aligned desktop AI workspace shell with a real Claude-backed chat flow, provider/settings modals, local persistence, and typed Electron IPC boundaries.

**Architecture:** Electron `main` owns persistence, provider adapters, and Claude runtime orchestration. `preload` exposes a typed bridge to the renderer. The renderer uses React, TanStack Router, Zustand, TanStack Query, Tailwind, and shadcn/ui to render the Alma-like shell, home empty state, modals, and chat workspace.

**Tech Stack:** Electron, React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Router, TanStack Query, Zustand, Zod, Vitest, Testing Library, SQLite (`better-sqlite3`), Drizzle ORM, `@anthropic-ai/claude-agent-sdk`

---

## References

- Spec: `docs/superpowers/specs/2026-03-20-moon-alma-workspace-design.md`
- Claude Agent SDK TypeScript reference: `https://platform.claude.com/docs/en/agent-sdk/typescript`
- Claude Agent SDK streaming output: `https://platform.claude.com/docs/en/agent-sdk/streaming-output`
- Claude Agent SDK approvals and user input: `https://platform.claude.com/docs/en/agent-sdk/user-input`

## Planned File Structure

### Existing files to modify

- `package.json`
- `electron.vite.config.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/main.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/assets/base.css`
- `src/renderer/src/assets/main.css`

### New config and tooling files

- `components.json`
- `vitest.config.ts`
- `src/renderer/src/test/setup.ts`

### New main-process files

- `src/main/bootstrap/create-window.ts`
- `src/main/bootstrap/register-ipc.ts`
- `src/main/db/connection.ts`
- `src/main/db/bootstrap.ts`
- `src/main/db/schema.ts`
- `src/main/ipc/contracts.ts`
- `src/main/ipc/channels.ts`
- `src/main/providers/provider-types.ts`
- `src/main/providers/claude/claude-adapter.ts`
- `src/main/providers/claude/normalize-claude-event.ts`
- `src/main/repositories/settings-repository.ts`
- `src/main/repositories/sessions-repository.ts`
- `src/main/repositories/projects-repository.ts`
- `src/main/services/settings-service.ts`
- `src/main/services/project-service.ts`
- `src/main/services/chat-runtime-service.ts`

### New renderer files

- `src/renderer/src/app/providers.tsx`
- `src/renderer/src/app/router.tsx`
- `src/renderer/src/app-shell/AppShell.tsx`
- `src/renderer/src/app-shell/LeftRail.tsx`
- `src/renderer/src/app-shell/WindowChrome.tsx`
- `src/renderer/src/features/home/HomeEmptyState.tsx`
- `src/renderer/src/features/chat/ChatWorkspace.tsx`
- `src/renderer/src/features/chat/MessageList.tsx`
- `src/renderer/src/features/chat/Composer.tsx`
- `src/renderer/src/features/chat/ToolEventCard.tsx`
- `src/renderer/src/features/chat/ApprovalCard.tsx`
- `src/renderer/src/features/chat/use-chat-session.ts`
- `src/renderer/src/features/providers/ProviderSetupDialog.tsx`
- `src/renderer/src/features/providers/provider-form-schema.ts`
- `src/renderer/src/features/settings/SettingsDialog.tsx`
- `src/renderer/src/features/projects/ProjectAttachmentButton.tsx`
- `src/renderer/src/lib/api.ts`
- `src/renderer/src/lib/query-client.ts`
- `src/renderer/src/lib/utils.ts`
- `src/renderer/src/lib/stores/ui-store.ts`
- `src/renderer/src/lib/stores/settings-store.ts`
- `src/renderer/src/lib/types.ts`
- `src/renderer/src/components/ui/*` via shadcn CLI

### Test files

- `src/renderer/src/features/home/HomeEmptyState.test.tsx`
- `src/renderer/src/app-shell/LeftRail.test.tsx`
- `src/renderer/src/features/providers/ProviderSetupDialog.test.tsx`
- `src/renderer/src/features/settings/SettingsDialog.test.tsx`
- `src/renderer/src/features/chat/ChatWorkspace.test.tsx`
- `src/main/repositories/settings-repository.test.ts`
- `src/main/providers/claude/normalize-claude-event.test.ts`
- `src/main/services/chat-runtime-service.test.ts`

## Task 1: Install the UI, testing, and state-management foundation

**Files:**

- Create: `components.json`
- Create: `vitest.config.ts`
- Create: `src/renderer/src/test/setup.ts`
- Create: `src/renderer/src/lib/utils.ts`
- Create: `src/renderer/src/features/home/HomeEmptyState.tsx`
- Modify: `package.json`
- Modify: `electron.vite.config.ts`
- Modify: `src/renderer/src/assets/base.css`
- Modify: `src/renderer/src/assets/main.css`
- Test: `src/renderer/src/features/home/HomeEmptyState.test.tsx`

- [ ] **Step 1: Write the failing renderer test**

```tsx
import { render, screen } from '@testing-library/react'
import { HomeEmptyState } from './HomeEmptyState'

it('renders the empty-state actions', () => {
  render(<HomeEmptyState />)

  expect(screen.getByRole('button', { name: 'New Chat' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Configure Provider' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/home/HomeEmptyState.test.tsx`

Expected: FAIL because `HomeEmptyState` and the Vitest test harness do not exist yet.

- [ ] **Step 3: Install dependencies and scaffold the shared foundation**

Run:

```bash
pnpm add @anthropic-ai/claude-agent-sdk @tanstack/react-query @tanstack/react-router better-sqlite3 class-variance-authority clsx drizzle-orm lucide-react tailwind-merge zustand zod
pnpm add -D @tailwindcss/vite @testing-library/jest-dom @testing-library/react @testing-library/user-event jsdom tailwindcss vitest
pnpm dlx shadcn@latest init -t vite -d
pnpm dlx shadcn@latest add button dialog input textarea tabs tooltip dropdown-menu scroll-area select separator command
```

Create:

```ts
// src/renderer/src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

Wire the Vite renderer plugin:

```ts
// electron.vite.config.ts
import tailwindcss from '@tailwindcss/vite'

renderer: {
  plugins: [react(), tailwindcss()]
}
```

Update `components.json` aliases so generated components import the existing renderer alias instead of `@/*`:

```json
{
  "aliases": {
    "components": "@renderer/components",
    "ui": "@renderer/components/ui",
    "utils": "@renderer/lib/utils",
    "lib": "@renderer/lib"
  }
}
```

- [ ] **Step 4: Run the test suite and typecheck to verify the foundation works**

Run:

```bash
pnpm vitest run src/renderer/src/features/home/HomeEmptyState.test.tsx
pnpm typecheck
```

Expected: the test passes with a placeholder `HomeEmptyState`, and typecheck passes with Tailwind/shadcn/Vitest wiring in place.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml components.json vitest.config.ts electron.vite.config.ts src/renderer/src/test/setup.ts src/renderer/src/lib/utils.ts src/renderer/src/assets/base.css src/renderer/src/assets/main.css src/renderer/src/features/home/HomeEmptyState.tsx src/renderer/src/features/home/HomeEmptyState.test.tsx src/renderer/src/components/ui
git commit -m "feat: add workspace frontend foundation"
```

## Task 2: Build the stable app shell and routing skeleton

**Files:**

- Create: `src/renderer/src/app/providers.tsx`
- Create: `src/renderer/src/app/router.tsx`
- Create: `src/renderer/src/app-shell/AppShell.tsx`
- Create: `src/renderer/src/app-shell/LeftRail.tsx`
- Create: `src/renderer/src/app-shell/WindowChrome.tsx`
- Create: `src/renderer/src/app-shell/LeftRail.test.tsx`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `src/renderer/src/app-shell/LeftRail.test.tsx`

- [ ] **Step 1: Write the failing shell test**

```tsx
import { render, screen } from '@testing-library/react'
import { LeftRail } from './LeftRail'

it('renders the minimal rail actions', () => {
  render(<LeftRail />)

  expect(screen.getByLabelText('New Chat')).toBeInTheDocument()
  expect(screen.getByLabelText('Settings')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `pnpm vitest run src/renderer/src/app-shell/LeftRail.test.tsx`

Expected: FAIL because the shell components do not exist yet.

- [ ] **Step 3: Implement the shell and route host**

Use TanStack Router even though v1 only needs home and chat. Keep route state app-owned from day one.

```tsx
// src/renderer/src/App.tsx
import { RouterProvider } from '@tanstack/react-router'
import { router } from './app/router'

export default function App(): React.JSX.Element {
  return <RouterProvider router={router} />
}
```

The `AppShell` should:

- render `WindowChrome`
- render the narrow left rail
- host page content in a single main panel
- host modal roots outside route content

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
pnpm vitest run src/renderer/src/app-shell/LeftRail.test.tsx
pnpm typecheck
```

Expected: PASS. The renderer should now mount through a stable shell instead of the default Electron starter screen.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/main.tsx src/renderer/src/App.tsx src/renderer/src/app src/renderer/src/app-shell
git commit -m "feat: add workspace shell and routing"
```

## Task 3: Implement the Alma-aligned home empty state

**Files:**

- Modify: `src/renderer/src/features/home/HomeEmptyState.tsx`
- Modify: `src/renderer/src/assets/base.css`
- Modify: `src/renderer/src/assets/main.css`
- Test: `src/renderer/src/features/home/HomeEmptyState.test.tsx`

- [ ] **Step 1: Expand the home-state test with layout assertions**

```tsx
it('shows the Alma-like empty-state controls', () => {
  render(<HomeEmptyState />)

  expect(screen.getByText('Moon')).toBeInTheDocument()
  expect(screen.getByText(/AI provider orchestration/i)).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled()
})
```

- [ ] **Step 2: Run the home-state test to verify the richer assertions fail**

Run: `pnpm vitest run src/renderer/src/features/home/HomeEmptyState.test.tsx`

Expected: FAIL because the placeholder component does not yet match the approved design.

- [ ] **Step 3: Implement the approved empty-state screen**

The component should mirror the approved layout:

```tsx
// src/renderer/src/features/home/HomeEmptyState.tsx
export function HomeEmptyState(): React.JSX.Element {
  return (
    <section className="home-empty-state">
      <div className="home-empty-state__brand">Moon</div>
      <div className="home-empty-state__actions">
        <Button>New Chat</Button>
        <Button variant="secondary">Configure Provider</Button>
        <Button variant="secondary">Settings</Button>
      </div>
      <Composer disabled placeholder="Type a message..." />
    </section>
  )
}
```

Match the visual constraints from the spec:

- quiet center composition
- minimal left rail
- bottom composer
- no right tool rail

- [ ] **Step 4: Run tests plus a local renderer smoke check**

Run:

```bash
pnpm vitest run src/renderer/src/features/home/HomeEmptyState.test.tsx
pnpm dev
```

Expected: the Vitest test passes, and the running app visually resembles the approved Alma-like home state instead of the starter template.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/home/HomeEmptyState.tsx src/renderer/src/assets/base.css src/renderer/src/assets/main.css src/renderer/src/features/home/HomeEmptyState.test.tsx
git commit -m "feat: add alma-style home empty state"
```

## Task 4: Add the provider and settings modals with UI stores

**Files:**

- Create: `src/renderer/src/features/providers/ProviderSetupDialog.tsx`
- Create: `src/renderer/src/features/providers/provider-form-schema.ts`
- Create: `src/renderer/src/features/settings/SettingsDialog.tsx`
- Create: `src/renderer/src/lib/stores/ui-store.ts`
- Create: `src/renderer/src/lib/stores/settings-store.ts`
- Test: `src/renderer/src/features/providers/ProviderSetupDialog.test.tsx`
- Test: `src/renderer/src/features/settings/SettingsDialog.test.tsx`

- [ ] **Step 1: Write failing modal tests**

```tsx
it('opens the provider setup modal from store state', () => {
  useUiStore.setState({ providerModalOpen: true })
  render(<ProviderSetupDialog />)

  expect(screen.getByRole('dialog', { name: 'Configure Provider' })).toBeInTheDocument()
})
```

```tsx
it('renders the settings sections', () => {
  useUiStore.setState({ settingsModalOpen: true })
  render(<SettingsDialog />)

  expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Providers' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Appearance' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Projects' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the modal tests to verify they fail**

Run:

```bash
pnpm vitest run src/renderer/src/features/providers/ProviderSetupDialog.test.tsx
pnpm vitest run src/renderer/src/features/settings/SettingsDialog.test.tsx
```

Expected: FAIL because the stores and dialog components do not exist yet.

- [ ] **Step 3: Implement modal state and modal UIs**

Use Zustand for modal visibility and optimistic settings form state.

```ts
// src/renderer/src/lib/stores/ui-store.ts
type UiState = {
  providerModalOpen: boolean
  settingsModalOpen: boolean
  openProviderModal: () => void
  openSettingsModal: () => void
  closeAllModals: () => void
}
```

Use Zod for the provider form:

```ts
// src/renderer/src/features/providers/provider-form-schema.ts
export const providerFormSchema = z.object({
  provider: z.literal('claude'),
  apiKey: z.string().min(1),
  model: z.string().min(1)
})
```

The modals should be visually complete, but they may still use mocked submit handlers until the IPC layer exists.

- [ ] **Step 4: Run tests and lint**

Run:

```bash
pnpm vitest run src/renderer/src/features/providers/ProviderSetupDialog.test.tsx src/renderer/src/features/settings/SettingsDialog.test.tsx
pnpm lint
```

Expected: PASS. Modal open/close flows and section tabs work without runtime wiring.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/providers src/renderer/src/features/settings src/renderer/src/lib/stores
git commit -m "feat: add provider and settings modals"
```

## Task 5: Add SQLite persistence and a typed Electron IPC bridge

**Files:**

- Create: `src/main/bootstrap/create-window.ts`
- Create: `src/main/bootstrap/register-ipc.ts`
- Create: `src/main/db/connection.ts`
- Create: `src/main/db/bootstrap.ts`
- Create: `src/main/db/schema.ts`
- Create: `src/main/ipc/contracts.ts`
- Create: `src/main/ipc/channels.ts`
- Create: `src/main/repositories/settings-repository.ts`
- Create: `src/main/repositories/sessions-repository.ts`
- Create: `src/main/repositories/projects-repository.ts`
- Create: `src/main/services/settings-service.ts`
- Create: `src/main/services/project-service.ts`
- Create: `src/main/repositories/settings-repository.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Test: `src/main/repositories/settings-repository.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
it('persists and reads provider settings', () => {
  const repository = new SettingsRepository(createTestDb())

  repository.saveProviderConfig({
    provider: 'claude',
    apiKey: 'sk-test',
    model: 'claude-sonnet-4-5'
  })

  expect(repository.getProviderConfig()?.model).toBe('claude-sonnet-4-5')
})
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `pnpm vitest run src/main/repositories/settings-repository.test.ts`

Expected: FAIL because the database and repository layers do not exist yet.

- [ ] **Step 3: Implement persistence plus typed IPC contracts**

Keep persistence narrow in v1:

- `settings` table for provider and appearance settings
- `projects` table for attached directories
- `sessions` table for chat session metadata

Create typed contracts owned by the app:

```ts
// src/main/ipc/contracts.ts
export type ProviderConfigDto = {
  provider: 'claude'
  apiKey: string
  model: string
}

export type ChatStreamEventDto =
  | { type: 'message.delta'; sessionId: string; text: string }
  | { type: 'message.completed'; sessionId: string; messageId: string }
  | { type: 'tool.requested'; sessionId: string; toolName: string; input: unknown }
  | { type: 'approval.requested'; requestId: string; toolName: string; input: unknown }
```

Expose a narrow preload bridge:

```ts
// src/preload/index.d.ts
interface Window {
  api: {
    settings: {
      get: () => Promise<AppSettingsDto>
      saveProvider: (input: ProviderConfigDto) => Promise<void>
    }
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
pnpm vitest run src/main/repositories/settings-repository.test.ts
pnpm typecheck
```

Expected: PASS. The app now owns typed persistence and a typed bridge instead of the starter `ping` IPC.

- [ ] **Step 5: Commit**

```bash
git add src/main src/preload
git commit -m "feat: add persistence and typed ipc bridge"
```

## Task 6: Implement the Claude adapter and normalized runtime events

**Files:**

- Create: `src/main/providers/provider-types.ts`
- Create: `src/main/providers/claude/claude-adapter.ts`
- Create: `src/main/providers/claude/normalize-claude-event.ts`
- Create: `src/main/providers/claude/normalize-claude-event.test.ts`
- Create: `src/main/services/chat-runtime-service.ts`
- Create: `src/main/services/chat-runtime-service.test.ts`
- Modify: `src/main/bootstrap/register-ipc.ts`
- Test: `src/main/providers/claude/normalize-claude-event.test.ts`
- Test: `src/main/services/chat-runtime-service.test.ts`

- [ ] **Step 1: Write failing normalization and runtime tests**

```ts
it('maps a partial text stream event into a renderer-safe delta', () => {
  const normalized = normalizeClaudeEvent({
    type: 'stream_event',
    session_id: 'session-1',
    event: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello' }
    }
  })

  expect(normalized).toEqual({
    type: 'message.delta',
    sessionId: 'session-1',
    text: 'Hello'
  })
})
```

```ts
it('creates an approval request when canUseTool asks for input', async () => {
  const service = createChatRuntimeService({ adapter: createAdapterDouble() })

  const request = await service.handleToolPermission('Bash', {
    command: 'rm -rf ./tmp'
  })

  expect(request.type).toBe('approval.requested')
})
```

- [ ] **Step 2: Run the runtime tests to verify they fail**

Run:

```bash
pnpm vitest run src/main/providers/claude/normalize-claude-event.test.ts
pnpm vitest run src/main/services/chat-runtime-service.test.ts
```

Expected: FAIL because the adapter and runtime services do not exist yet.

- [ ] **Step 3: Implement the Claude adapter using official SDK capabilities**

Use the official SDK APIs documented in the TypeScript reference:

- `query()` for session execution
- `includePartialMessages: true` for stream events
- `canUseTool` for runtime approvals and `AskUserQuestion`
- `listSessions()` and `getSessionMessages()` for resume metadata

Adapter sketch:

```ts
// src/main/providers/claude/claude-adapter.ts
export async function* runClaudeSession(input: ClaudeRunInput): AsyncGenerator<ChatStreamEventDto> {
  const stream = query({
    prompt: input.prompt,
    options: {
      cwd: input.cwd,
      model: input.model,
      includePartialMessages: true,
      canUseTool: input.canUseTool
    }
  })

  for await (const message of stream) {
    const normalized = normalizeClaudeEvent(message)
    if (normalized) yield normalized
  }
}
```

Do not leak raw SDK event types beyond the adapter boundary.

- [ ] **Step 4: Run runtime tests**

Run:

```bash
pnpm vitest run src/main/providers/claude/normalize-claude-event.test.ts src/main/services/chat-runtime-service.test.ts
pnpm typecheck
```

Expected: PASS. The main process now owns an app-defined event stream instead of renderer code depending on SDK-native event shapes.

- [ ] **Step 5: Commit**

```bash
git add src/main/providers src/main/services src/main/bootstrap/register-ipc.ts
git commit -m "feat: add claude runtime adapter"
```

## Task 7: Build the chat workspace and streaming event rendering

**Files:**

- Create: `src/renderer/src/features/chat/ChatWorkspace.tsx`
- Create: `src/renderer/src/features/chat/MessageList.tsx`
- Create: `src/renderer/src/features/chat/Composer.tsx`
- Create: `src/renderer/src/features/chat/ToolEventCard.tsx`
- Create: `src/renderer/src/features/chat/ApprovalCard.tsx`
- Create: `src/renderer/src/features/chat/use-chat-session.ts`
- Create: `src/renderer/src/lib/api.ts`
- Create: `src/renderer/src/lib/query-client.ts`
- Create: `src/renderer/src/lib/types.ts`
- Create: `src/renderer/src/features/chat/ChatWorkspace.test.tsx`
- Modify: `src/renderer/src/app/router.tsx`
- Test: `src/renderer/src/features/chat/ChatWorkspace.test.tsx`

- [ ] **Step 1: Write the failing chat workspace test**

```tsx
it('renders streamed text, tool events, and approvals', async () => {
  mockChatStream([
    { type: 'message.delta', sessionId: 'session-1', text: 'Hello' },
    {
      type: 'tool.requested',
      sessionId: 'session-1',
      toolName: 'Read',
      input: { file_path: 'README.md' }
    },
    {
      type: 'approval.requested',
      requestId: 'approval-1',
      toolName: 'Bash',
      input: { command: 'npm test' }
    }
  ])

  render(<ChatWorkspace sessionId="session-1" />)

  expect(await screen.findByText('Hello')).toBeInTheDocument()
  expect(screen.getByText('Read')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the chat workspace test to verify it fails**

Run: `pnpm vitest run src/renderer/src/features/chat/ChatWorkspace.test.tsx`

Expected: FAIL because the chat feature and runtime bridge are not connected yet.

- [ ] **Step 3: Implement the chat workspace**

Use TanStack Query for initial session fetches and a custom streaming hook for live events.

```ts
// src/renderer/src/features/chat/use-chat-session.ts
export function useChatSession(sessionId: string): ChatSessionViewModel {
  const [events, setEvents] = useState<ChatStreamEventDto[]>([])

  useEffect(() => window.api.chat.subscribe(sessionId, setEvents), [sessionId])

  return buildChatViewModel(events)
}
```

The workspace must render:

- message thread
- streaming assistant output
- tool event cards
- approval cards
- bottom composer

- [ ] **Step 4: Run tests and a manual app smoke check**

Run:

```bash
pnpm vitest run src/renderer/src/features/chat/ChatWorkspace.test.tsx
pnpm dev
```

Expected: PASS in tests, and manual smoke check confirms `New Chat` transitions from the home screen into a real chat workspace.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/chat src/renderer/src/lib/api.ts src/renderer/src/lib/query-client.ts src/renderer/src/lib/types.ts src/renderer/src/app/router.tsx
git commit -m "feat: add chat workspace streaming ui"
```

## Task 8: Wire provider persistence, session resume metadata, and project attachment

**Files:**

- Create: `src/renderer/src/features/projects/ProjectAttachmentButton.tsx`
- Modify: `src/main/services/settings-service.ts`
- Modify: `src/main/services/project-service.ts`
- Modify: `src/main/services/chat-runtime-service.ts`
- Modify: `src/main/repositories/projects-repository.ts`
- Modify: `src/main/repositories/sessions-repository.ts`
- Modify: `src/renderer/src/features/providers/ProviderSetupDialog.tsx`
- Modify: `src/renderer/src/features/chat/Composer.tsx`
- Modify: `src/renderer/src/features/chat/ChatWorkspace.tsx`
- Test: `src/main/services/chat-runtime-service.test.ts`
- Test: `src/renderer/src/features/providers/ProviderSetupDialog.test.tsx`

- [ ] **Step 1: Add failing tests for provider save and project attachment**

```tsx
it('saves the provider configuration through the bridge', async () => {
  render(<ProviderSetupDialog />)

  await user.type(screen.getByLabelText('API Key'), 'sk-test')
  await user.click(screen.getByRole('button', { name: 'Save Provider' }))

  expect(window.api.settings.saveProvider).toHaveBeenCalled()
})
```

```ts
it('persists session metadata with the attached project path', async () => {
  await service.startSession({
    prompt: 'Summarize this repo',
    projectPath: '/tmp/moon'
  })

  expect(sessionRepo.list()[0]?.projectPath).toBe('/tmp/moon')
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
pnpm vitest run src/renderer/src/features/providers/ProviderSetupDialog.test.tsx
pnpm vitest run src/main/services/chat-runtime-service.test.ts
```

Expected: FAIL because save handlers and project/session metadata persistence are incomplete.

- [ ] **Step 3: Implement the persistence-backed flows**

The provider modal should save into the settings service over IPC.

The chat start flow should:

- load the active Claude config
- optionally attach a project path
- persist session metadata after startup
- expose a minimal project-attachment affordance in the composer/header

Use SDK resume metadata where appropriate:

```ts
// src/main/services/chat-runtime-service.ts
const sessions = await listSessions({ dir: projectPath, limit: 20 })
const messages = await getSessionMessages(sessionId, { dir: projectPath, limit: 100 })
```

- [ ] **Step 4: Run the targeted tests and a full verification sweep**

Run:

```bash
pnpm vitest run src/renderer/src/features/providers/ProviderSetupDialog.test.tsx src/main/services/chat-runtime-service.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Expected: PASS. The app can save provider settings, launch a Claude-backed session, attach a project path, and build successfully.

- [ ] **Step 5: Commit**

```bash
git add src/main/services src/main/repositories src/renderer/src/features/providers src/renderer/src/features/projects src/renderer/src/features/chat
git commit -m "feat: persist provider and project-backed chat flows"
```

## Final Verification Checklist

- [ ] Run `pnpm vitest run`
- [ ] Run `pnpm lint`
- [ ] Run `pnpm typecheck`
- [ ] Run `pnpm build`
- [ ] Launch `pnpm dev` and verify:
  - home empty state matches the approved Alma-like layout
  - left rail only shows `New Chat` and bottom `Settings`
  - provider modal opens from CTA and rail entry
  - settings modal opens from CTA and rail entry
  - `New Chat` enters the chat workspace
  - streaming message text appears incrementally
  - tool requests and approval cards render
  - project attachment is visible and persisted in session metadata

## Notes for the Implementer

- Keep renderer code ignorant of raw `@anthropic-ai/claude-agent-sdk` event shapes.
- Keep v1 scoped to Claude runtime only, even if the UI says "provider".
- Do not add prompt-app, library, plugin, or multi-agent systems in this plan.
- Preserve the approved Alma-like empty-state proportions unless the user explicitly reopens design.
