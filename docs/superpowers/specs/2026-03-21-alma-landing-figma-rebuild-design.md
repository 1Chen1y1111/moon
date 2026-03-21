# Alma Landing Figma Rebuild Design

## Overview

This document defines a Figma-faithful rebuild of the desktop landing experience for Moon using the node `1002:2` from the provided design file.

The implementation target is a static visual reconstruction of the full landing screen, including the floating left sidebar and centered Alma hero area. The app should visually match the Figma composition, while the code should be reorganized semantically instead of mirroring raw Figma layer names.

## Goal

Replace the current generic shell and home empty state with a semantically structured, visually faithful Alma landing screen that:

- preserves the Figma branding and copy as `Alma`
- recreates the full-page desktop composition, not just the center hero
- keeps buttons semantic and accessible
- does not wire real business actions in this iteration

## Confirmed Scope

### In Scope

- full visual reconstruction of the Figma landing screen
- dark desktop background and floating left sidebar
- macOS-style traffic-light window controls inside the sidebar
- sidebar navigation copy:
  - `清除历史`
  - `新建聊天`
- sidebar footer with overflow glyph and `更新` pill
- centered Alma brand hero:
  - logo card
  - `Alma` title
  - subtitle `优雅的 AI 提供商编排桌面应用`
  - primary button `新建聊天`
  - secondary buttons `配置提供商` and `设置`
  - helper text `请至少配置一个 AI 提供商以开始聊天`
- semantic component refactor of the shell and home view
- local visual asset handling for the core logo and icons
- updated tests for the new static shell and landing view

### Out of Scope

- wiring `新建聊天`
- wiring `配置提供商`
- wiring `设置`
- wiring `更新`
- opening dialogs from the new landing view
- route changes beyond keeping the landing screen on `/`
- chat workspace redesign
- provider runtime changes
- persistence or data model changes

## Product Constraints

- The screen must preserve the Figma copy and brand as `Alma`
- This iteration is visual-only and should not introduce half-wired behavior
- The repository already uses Electron, React, TypeScript, Tailwind CSS v4, and `shadcn/ui`
- The implementation should follow project conventions instead of copying the raw MCP output directly
- The code should stay maintainable for later behavior wiring

## Existing Project Context

The current renderer structure uses:

- `AppShell` as the outer shell
- `LeftRail` as a narrow icon rail
- `WindowChrome` as a separate top header
- `HomeEmptyState` as the default `/` route surface

These abstractions do not match the Figma composition closely enough. The current shell separates window chrome and rail in a way that would force awkward overrides if reused literally.

## Recommended Architecture

The landing page should be rebuilt as a semantic composition with clear responsibilities.

### Top-Level Structure

```text
WorkspaceShell
├─ FloatingSidebar
│  ├─ SidebarTopBar
│  ├─ SidebarNavList
│  └─ SidebarBottomActions
└─ AlmaLandingView
   └─ AlmaBrandHero
      └─ ActionCluster
```

### Responsibilities

#### `WorkspaceShell`

- owns the full desktop landing layout
- applies the dark app background
- arranges the floating sidebar and centered main stage
- remains the route-level shell entry point so router structure stays stable

#### `FloatingSidebar`

- renders the left floating panel at fixed desktop width
- contains the traffic-light controls and top utility icons
- contains the static navigation labels
- contains the static footer action row

#### `AlmaLandingView`

- centers the hero area within the main stage
- constrains content width to match the Figma visual rhythm

#### `AlmaBrandHero`

- renders the logo card, title, subtitle, buttons, and helper text
- owns spacing and vertical hierarchy for the central branding block

#### `ActionCluster`

- renders one primary action and two secondary actions
- keeps buttons semantic with no business handlers for now

## Visual System

This page should use a dedicated Alma landing token set rather than leaning on the default app neutrals alone.

### Color Tokens

- `--alma-app-bg: #282c34`
- `--alma-sidebar-bg: #20242c`
- `--alma-sidebar-border: rgba(255,255,255,0.05)`
- `--alma-panel-border: rgba(255,255,255,0.08)`
- `--alma-text-primary: #ffffff`
- `--alma-text-secondary: #9ca3af`
- `--alma-text-muted: #6b7280`
- `--alma-accent: #61aff0`
- `--alma-accent-text: #1a1d23`
- `--alma-update-bg: rgba(98,174,238,0.10)`
- `--alma-update-text: #62aeee`

### Typography

- Brand heading should use a serif display face aligned to the Figma feel, preferably `Source Serif 4`
- Supporting interface text should remain in the project sans stack
- The `Alma` title should preserve the oversized serif emphasis from the design
- Supporting Chinese copy should use restrained sizing and muted contrast

### Radius and Shadow

- use `12px`, `16px`, and `24px` as the main radius scale
- preserve the soft panel and button shadows visible in the Figma node
- avoid shadcn default visual styling when it conflicts with the design

### Layout Measurements

- outer sidebar gutter: `16px`
- floating sidebar width: `256px`
- main hero max width: `672px`
- primary CTA width: `360px`
- secondary CTA width: `174px` each

These values should be implemented directly where they materially define the composition. Do not over-abstract them into a generalized spacing system.

## Asset Strategy

The Figma MCP returned remote assets for the logo and several sidebar icons. Those URLs are temporary and should not become a runtime dependency.

The implementation should:

- localize the key Alma logo asset into the repository or recreate it as local SVG
- localize sidebar glyphs that are necessary for the visual match
- avoid leaving the renderer dependent on 7-day Figma asset URLs

## Accessibility and Interaction Boundary

Even though this iteration is static, the screen should still preserve semantic HTML:

- actionable visuals remain `button` elements
- the main content should remain in a `main` landmark
- the sidebar should remain an `aside`
- labels and visible copy should be testable through accessible text queries

Interaction behavior for this iteration:

- no route transitions
- no dialog opens
- no state mutations
- hover and focus states are allowed as visual affordances only

## File Impact

### Keep but Rewrite

- `src/renderer/src/app-shell/AppShell.tsx`
- `src/renderer/src/app-shell/LeftRail.tsx`
- `src/renderer/src/app-shell/WindowChrome.tsx`
- `src/renderer/src/features/home/HomeEmptyState.tsx`
- `src/renderer/src/assets/main.css`

### Likely Add

- one or more local asset files under `src/renderer/src/assets/`
- one or more focused shell or home subcomponents if the current files become too crowded

The exact file split should be chosen during planning, but the code should move toward the semantic architecture described above.

## Testing Strategy

Update renderer tests to reflect the new static landing screen rather than the current minimal rail shell.

Required coverage:

- the landing route renders `Alma`
- the subtitle renders exactly
- the sidebar renders the expected navigation copy
- the three main CTA labels render
- the main structural landmarks are still present

Verification should include:

- targeted Vitest runs for affected renderer tests
- project typecheck

This iteration does not require tests for dialog opening or route navigation because those behaviors are intentionally not wired.

## Success Criteria

The work is successful when:

- the landing screen visually matches the provided Figma node closely
- the full-page composition includes the floating sidebar and centered Alma hero
- the branding and copy remain `Alma`
- buttons are semantic but inactive
- the previous narrow rail and top header no longer dominate the landing layout
- remote Figma asset URLs are not required at runtime
- tests and typecheck pass after the refactor

## Recommended Next Step

Create an implementation plan that:

- defines the exact file split for the rebuilt shell
- specifies how local assets will be added
- covers CSS token updates in `main.css`
- updates tests before or alongside the UI refactor
- finishes with verification through renderer tests and typecheck
