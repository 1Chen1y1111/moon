# Moon Alma Workspace Design

## Overview

Moon v1 is a desktop AI workspace built with Electron. The first release should align closely with Alma's desktop product shape, especially the empty home screen and the overall shell behavior, while using `@anthropic-ai/claude-agent-sdk` as the only real runtime backend.

This is not a multi-agent product in v1. It is a Claude-based desktop workspace with a provider-ready shell.

## Product Goal

Ship a desktop MVP that:

- feels almost identical to Alma's initial desktop shell
- uses a dedicated settings modal instead of a settings page in the main workspace
- supports real Claude-backed chat sessions
- keeps the architecture ready for future provider expansion

## Product Positioning

Moon v1 is:

- a desktop AI workspace
- a unified shell for chats, provider setup, and local project attachment
- Claude-only at runtime

Moon v1 is not:

- a multi-agent orchestration product
- a real multi-provider runtime
- a full prompt app ecosystem
- a full library or plugin platform

## Core Constraints

- Platform: desktop only
- Shell: Electron
- UI stack: React, TypeScript, Tailwind CSS, shadcn/ui
- Runtime backend: `@anthropic-ai/claude-agent-sdk`
- Provider model: provider-ready UI shell, but only Claude is implemented
- Settings surface: modal, not a primary page
- Left rail in home state: minimal icon rail with `New Chat` and bottom-left `Settings`
- Right vertical tool rail: out of scope for v1

## Primary Experience

The first impression must match Alma's empty-state feel more than a typical chat application.

The first screen should:

- show a minimal left rail
- center the brand and empty-state actions
- keep the workspace visually quiet
- anchor the composer at the bottom

The first implementation target is a near 1:1 structural match to Alma's empty home view, with Moon branding replacing Alma branding.

## Information Architecture

Moon v1 uses a stable desktop shell:

```text
+----------------------------------------------------------------------------------+
| Minimal Left Rail | Main Workspace                                               |
|                   |                                                               |
| + New Chat        | Empty home state or active chat workspace                     |
|                   |                                                               |
|                   | Centered brand / CTA area                                    |
|                   |                                                               |
|                   | Bottom composer                                               |
|                   |                                                               |
|         Settings  |                                                               |
+----------------------------------------------------------------------------------+
```

### Home Empty State

The default home screen should closely match Alma's empty state:

- minimal left icon rail
- centered logo, title, subtitle
- primary CTA for `New Chat`
- secondary CTAs for `Configure Provider` and `Settings`
- bottom idle composer

### Chat Workspace

Starting a new chat transitions the main area into an active chat workspace while preserving the same outer shell.

The chat workspace includes:

- message thread
- bottom composer
- streaming assistant responses
- tool event blocks
- approval request cards
- optional attached project context

## Page and Surface Scope

Moon v1 includes these primary surfaces:

1. `Home Empty State`
2. `Chat Workspace`
3. `Provider Setup Modal`
4. `Settings Modal`

### Home Empty State

Responsibilities:

- establish the visual identity of the app
- prompt provider configuration before first use
- let the user start a new chat

### Chat Workspace

Responsibilities:

- host the real Claude-backed conversation
- render streaming output
- show tool usage and approvals
- allow project context attachment

### Provider Setup Modal

Responsibilities:

- configure a provider in a provider-ready UI
- store Claude credentials and model settings
- verify connection

Initial scope:

- provider type
- API key
- model or runtime choice
- connection test

### Settings Modal

Responsibilities:

- manage global preferences without becoming a main navigation destination

Initial sections:

- General
- Providers
- Appearance
- Projects

Deferred sections may be listed as placeholders, but they should not require deep implementation in v1.

## Functional Scope

### Must Have in v1

- Alma-like desktop shell
- minimal left rail
- home empty state
- settings modal
- provider setup modal
- Claude-backed chat session start
- Claude-backed chat resume metadata
- streaming message rendering
- tool event rendering
- approval flow rendering and response
- local project directory attachment
- local settings persistence
- basic chat history metadata persistence

### Explicitly Out of Scope for v1

- multi-agent orchestration
- real multi-provider runtime
- full prompt apps system
- full library system
- full live coding workspace
- team features
- cloud accounts
- cloud sync
- plugin marketplace
- right-side tool rail

## Runtime and Architecture Boundaries

Renderer code must not talk directly to the Claude SDK.

Required layers:

```text
Claude Agent SDK raw events
-> runtime normalization layer in Electron main
-> typed IPC bridge
-> renderer view models
```

### Main Process Responsibilities

- host provider adapters
- host the Claude runtime service
- normalize Claude SDK events into app-owned event models
- manage approvals
- manage persistence
- expose typed IPC handlers

### Renderer Responsibilities

- render shell and UI state
- consume normalized runtime events
- send user actions back through IPC
- avoid direct dependency on Claude SDK event shapes

## Frontend Module Boundaries

The renderer should be organized into these modules:

- `app-shell`
- `chat`
- `providers`
- `projects`
- `settings`
- `runtime-bridge`

### app-shell

- window frame area
- minimal left rail
- main content host
- modal host

### chat

- conversation view
- message blocks
- composer
- tool event blocks
- approval cards

### providers

- provider config modal
- adapter selection UI
- connection state
- model selection

### projects

- recent project list
- local directory attachment
- project metadata

### settings

- preferences UI
- appearance UI
- provider shortcuts
- project settings entry points

### runtime-bridge

- IPC request wrappers
- normalized event subscriptions
- renderer-safe DTOs

## Core Data Model

Moon v1 should define app-owned models rather than exposing SDK-native structures to the UI.

Required initial models:

- `ProviderConfig`
- `ChatSession`
- `Message`
- `ToolEvent`
- `ApprovalRequest`
- `ProjectRef`
- `AppSettings`

Relationships:

```text
ProviderConfig -> selects runtime backend
ChatSession -> has many Message
Message -> may reference ToolEvent and ApprovalRequest
ChatSession -> may attach ProjectRef
AppSettings -> stores global preferences
```

## Interaction Flow

Primary v1 flow:

1. User opens Moon and sees the empty home state.
2. User configures a provider if required.
3. User starts a new chat.
4. Renderer requests chat startup over IPC.
5. Main process selects the Claude adapter.
6. Claude runtime streams events.
7. Main process normalizes events.
8. Renderer renders messages, tool events, and approvals.
9. User approves or rejects gated actions.
10. Renderer sends the decision back to main.
11. Main continues the runtime loop.

## Technical Stack

Recommended stack for v1:

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Zustand
- TanStack Query
- SQLite with `better-sqlite3`
- Drizzle ORM
- Zod
- `@anthropic-ai/claude-agent-sdk`

## Design Principles

- Match Alma's home shell closely in v1
- Prefer a quiet desktop-tool feel over a busy chat-app feel
- Keep the main workspace visually calm
- Do not overbuild v1 around future systems
- Preserve clear runtime boundaries so future provider expansion does not require renderer rewrites

## Implementation Strategy Recommendation

Use a balanced shell-and-runtime approach:

- build the Alma-aligned shell first
- wire in the provider modal and settings modal
- connect the minimal Claude runtime path early
- avoid building placeholder ecosystems that are not needed for the first usable release

## Open Decisions Already Resolved

- Desktop MVP: yes
- Product direction: unified AI workspace
- Visual/product alignment: Alma
- Runtime backend for v1: Claude only
- Provider abstraction: shell ready, runtime Claude only
- Multi-agent in v1: no
- Settings placement: modal
- Left rail in home state: minimal with `New Chat` and bottom-left `Settings`
- Right tool rail in v1: no

## Success Criteria for v1

The first implementation is successful if:

- the app home screen feels recognizably close to Alma's empty-state desktop shell
- a user can configure Claude and start a real chat session
- streaming output, tool events, and approvals render in the chat workspace
- settings persist locally
- project attachment exists in a minimal usable form
- the renderer remains isolated from Claude SDK raw event structures
