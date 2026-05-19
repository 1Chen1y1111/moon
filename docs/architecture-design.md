# Moon 架构设计文档

本文档基于 2026-04-23 当前源码整理，目标是描述 Moon 现有架构、模块边界、运行时数据流，以及继续扩展时应优先遵守的设计约束。

## 1. 设计目标

Moon 是一个基于 Electron、React、TypeScript 的桌面应用。当前产品形态是“AI 提供商编排桌面应用”的基础骨架，已经具备：

- Electron 主窗口和独立设置窗口。
- 通过 preload 暴露的受控 `window.api`。
- 设置数据（外观与 provider）的 IPC、校验、仓储和 PGlite 持久化链路。
- React 渲染层的路由、壳层、设置页、主题选择和 provider 本地草稿状态。
- 面向后续项目、会话、Agent、插件等能力的初始目录和数据表预留。

核心架构倾向是：主进程负责系统能力、窗口和持久化；preload 作为安全桥；renderer 只通过显式 IPC API 访问主进程能力。

## 2. 总体架构

```text
+------------------------- Electron App -------------------------+
|                                                                 |
|  Main Process                                                   |
|  apps/desktop/src/main/index.ts                                              |
|  +-------------------+      +----------------------+             |
|  | Window Bootstrap  |      | IPC Handlers          |             |
|  | create-window     |<---->| register-ipc          |             |
|  | create-settings   |      +----------+-----------+             |
|  +-------------------+                 |                         |
|                                        v                         |
|                              +----------------------+             |
|                              | Services             |             |
|                              | settings-service     |             |
|                              +----------+-----------+             |
|                                        |                         |
|                                        v                         |
|                              +----------------------+             |
|                              | Repositories         |             |
|                              | settings/sessions/   |             |
|                              | messages             |             |
|                              +----------+-----------+             |
|                                        |                         |
|                                        v                         |
|                              +----------------------+             |
|                              | PGlite / Drizzle     |             |
|                              | userData/moon-pglite |             |
|                              +----------------------+             |
|                                                                 |
|  Cross-process Contracts + Domain Types                         |
|  packages/ipc/src + packages/shared/src/domain                                     |
|  @moon/ipc/channels + @moon/ipc/contracts + shared domain                  |
|                                                                 |
|  Preload                                                        |
|  apps/desktop/src/preload/index.ts                                           |
|  exposes window.api                                             |
|                                                                 |
|  Renderer                                                       |
|  apps/desktop/src/renderer/src                                               |
|  +-------------------+      +----------------------+             |
|  | Router            |      | Zustand Store         |             |
|  | / /chat /settings |      | settings / chat       |             |
|  +---------+---------+      +----------+-----------+             |
|            |                           |                         |
|            v                           v                         |
|  +-------------------+      +----------------------+             |
|  | Widgets           |      | Pages / Features      |             |
|  | workspace/settings|      | home/settings         |             |
|  +---------+---------+      +----------+-----------+             |
|            |                           |                         |
|            v                           v                         |
|  +-------------------+      +----------------------+             |
|  | Entities          |      | Renderer Shared       |             |
|  | settings model    |      | ui/assets/styles      |             |
|  +-------------------+      +----------------------+             |
|                                                                 |
+-----------------------------------------------------------------+
```

## 3. 进程与职责边界

### 3.1 Main Process

入口文件：`apps/desktop/src/main/index.ts`

主进程负责：

- Electron 生命周期：`app.whenReady`、`activate`、`window-all-closed`、`will-quit`。
- 应用图标和窗口创建：`apps/desktop/src/main/bootstrap/app-icon.ts`、`create-window.ts`、`create-settings-window.ts`。
- 数据库连接、Drizzle migration 和 schema 定义：`apps/desktop/src/main/db/connection.ts`、`bootstrap.ts`、`schema.ts`。
- IPC handler 注册：`apps/desktop/src/main/bootstrap/register-ipc.ts`。
- 注入服务和仓储依赖：目前 settings 链路使用 `SettingsService + SettingsRepository`。

启动流程：

```text
app.whenReady
  -> setAppUserModelId
  -> setApplicationIcon
  -> createDatabaseConnection(userData/moon-pglite)
  -> bootstrapDatabase
  -> registerIpcHandlers
  -> createMainWindow
```

退出时，`will-quit` 会关闭数据库连接，避免进程退出后连接悬挂。

### 3.2 Preload

入口文件：`apps/desktop/src/preload/index.ts`

preload 的职责是把主进程能力收敛为受控 API。当前只暴露 `window.api`，类型为 `MoonApi`，不再把 `@electron-toolkit/preload` 的通用 `electronAPI` 暴露给 renderer。

当前 `window.api` 包含两组能力：

- `settings.get()`、`settings.saveProvider(input)`、`settings.saveAppearance(input)`、`settings.onChange(listener)`。
- `windowControls.close()`、`minimize()`、`toggleMaximize()`、`openSettings(input?)`、`getState()`、`onStateChange(listener)`。

`invokeIpcChannel` 使用 `AppIpcContractMap` 做类型映射，让 channel 的 request/response 类型在 preload 侧保持一致。

### 3.3 Renderer

入口文件：`apps/desktop/src/renderer/src/main.tsx`

渲染层由 React 组成，主要职责是：

- 通过 TanStack Router 组织页面。
- 通过 Zustand 管理客户端 UI 状态。
- 通过 `window.api` 请求主进程能力。
- 使用 Tailwind CSS v4、shadcn 本地组件和 Radix primitives 组成界面。

渲染层不直接访问 Node、数据库或 Electron 主进程对象。

## 4. 目录结构

以下目录职责以架构边界为准；`node_modules/`、`out/` 等依赖或构建产物不作为源码设计边界。

```text
.
  docs/                          架构、规格、计划等工程文档
  packages/                      共享 workspace packages
    shared/                      纯领域类型、默认值和校验 schema
    ipc/                         IPC channel、契约和窗口控制类型
    ui/                          本地 shadcn primitives、hooks 和工具函数
  screenshorts/                  UI 截图参考和视觉回归素材
  scripts/                       本地维护脚本，例如图标生成和 shadcn 组件更新
  tests/                         集中式测试目录
    helpers/                     测试工具和环境 setup
      renderer/                  renderer/jsdom 测试 helper
    unit/                        单元和轻量边界测试
      main/                      main process、窗口、IPC、service 测试
      preload/                   preload bridge 暴露行为测试
      renderer/                  renderer 页面、layout、entity 测试
    integration/                 轻集成测试
      main/                      PGlite、repository、database bootstrap 测试

  apps/
    desktop/                     Electron 桌面应用 workspace package
      build/                     electron-builder 打包图标和平台构建资源
      drizzle/                   Drizzle 生成的 PGlite/Postgres migration
      resources/                 Electron 运行期资源、源 logo、生成图标和 tray 图标
      src/
        main/                    Electron main process 源码
        preload/                 Electron preload 源码
        renderer/src/            React renderer 源码
```

目录边界约束：

- `packages/ipc/src` 只放跨进程协议、类型和 schema；不依赖 main、preload 或 renderer 实现。
- `apps/desktop/src/main` 可以依赖 `@moon/ipc`，不能依赖 `@renderer` 或 renderer-only 文件。
- `apps/desktop/src/preload` 只做桥接和类型映射，不承载业务逻辑或持久化逻辑。
- `apps/desktop/src/renderer/src/components` 只放 renderer 内部复用 UI 组件，组件目录使用 PascalCase。
- `apps/desktop/src/renderer/src/assets` 和 `apps/desktop/src/renderer/src/styles` 只服务 renderer 内部，不能被 main/preload 反向依赖。
- `packages/shared/src/domain` 只放跨进程共享的纯领域类型、常量和默认值；不放 UI、Electron、数据库连接或业务编排。
- `packages/ui/src` 是本地 vendor 化 UI primitive，业务组合应放在 renderer 的 `components`、`features` 或 `layouts`。
- `tests` 使用镜像源码结构集中组织测试；测试可以依赖 `@main`、`@preload`、`@renderer`、`@moon/ipc` 和 `@tests` alias，但源码不应依赖 `@tests`。

## 5. IPC 契约与数据流

IPC channel 集中定义在 `packages/ipc/src/channels.ts`，契约和 schema 集中定义在 `packages/ipc/src/contracts.ts`。跨进程共享的纯领域类型放在 `packages/shared/src/domain`，再由 `packages/ipc/src/contracts.ts` 复用和必要时 re-export。`main`、`preload` 和 `renderer` 共同依赖这层协议，避免类型漂移。

导入约定：

```text
@moon/ipc/channels        IPC channel 常量
@moon/ipc/contracts       request/response 类型、Zod schema、跨进程 DTO
@moon/shared/domain/...   provider、settings、chat 等纯领域类型和默认值
@moon/ui/ui/...           本地 shadcn primitives
@moon/ui/lib/utils        cn 等 UI 工具函数
@renderer/components/...  renderer 内部复用 UI 组件
@renderer/assets/...      renderer 内部静态资源
```

`packages/ipc/src` 是 app-wide 的跨进程协议层，不放 renderer 组件、样式或主进程实现。`packages/shared/src/domain` 是更底层的纯领域模型层，不引入 Zod、Electron、Drizzle 或 React。`apps/desktop/src/renderer/src/components`、`apps/desktop/src/renderer/src/assets` 和 `apps/desktop/src/renderer/src/styles` 是 renderer bounded context 内的复用层，三者不要和跨进程共享层混用。

当前 channel：

```text
settings:get
settings:save-provider
settings:save-appearance
settings:on-change
window:close
window:minimize
window:toggle-maximize
window:open-settings
window:get-state
window:on-state-change
```

Provider 设置保存链路：

```text
Renderer UI
  -> window.api.settings.saveProvider(input)
  -> preload invokeIpcChannel('settings:save-provider', input)
  -> ipcMain.handle
  -> SettingsService.saveProvider
  -> saveProviderInputSchema.parse(input)
  -> SettingsRepository.saveProvider
  -> Drizzle upsert provider_settings table
  -> AppSettings response
  -> broadcastSettingsChange(settings)
  -> all windows receive settings:on-change
  -> renderer applyAppSettings(settings)
```

外观设置保存链路：

```text
Renderer UI
  -> window.api.settings.saveAppearance({ theme })
  -> preload invokeIpcChannel('settings:save-appearance', input)
  -> ipcMain.handle
  -> SettingsService.saveAppearance
  -> saveAppearanceInputSchema.parse(input)
  -> SettingsRepository.saveAppearance
  -> Drizzle upsert settings table, key = appearance.theme
  -> AppSettings response and settings:on-change broadcast
```

窗口控制链路：

```text
Renderer window control button
  -> window.api.windowControls.close/minimize/toggleMaximize/openSettings(input?)
  -> preload IPC invoke
  -> registerIpcHandlers
  -> BrowserWindow.fromWebContents(event.sender)
  -> operate on sender window
```

窗口状态变更链路：

```text
BrowserWindow maximize/unmaximize/restore
  -> registerWindowStateEvents
  -> webContents.send('window:on-state-change', { isMaximized })
  -> preload window.api.windowControls.onStateChange(listener)
```

## 6. 数据持久化设计

数据库目录位于 Electron `app.getPath('userData')` 下，当前目录名为 `moon-pglite`。开发期 Drizzle Kit 配置使用 `./.moon-pglite-dev` 作为本地数据库目录。

连接抽象：`apps/desktop/src/main/db/connection.ts`

- 使用 `@electric-sql/pglite` 创建嵌入式 Postgres-compatible 数据库。
- 使用 `drizzle-orm/pglite` 创建类型化 `db`，repository 统一通过 Drizzle 查询和写入。
- 统一暴露 `AppDatabaseConnection`，包含 `db`、底层 PGlite `client` 和异步 `close()`。
- `createDatabaseConnection('memory://')` 可用于测试；非内存路径会先确保目录存在。
- `bootstrapDatabase` 使用 `drizzle-orm/pglite/migrator` 执行 `apps/desktop/drizzle/` 下的 migration，migration 状态表为 `public.__drizzle_migrations`。
- 打包时 `electron-builder.yml` 通过 `extraResources` 把 `apps/desktop/drizzle/` 放入应用资源目录，运行期 `getMigrationsFolder()` 会在 packaged 与开发环境之间选择正确路径。

Schema：`apps/desktop/src/main/db/schema.ts`

```text
settings
  key TEXT PRIMARY KEY
  value TEXT NOT NULL
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL

provider_settings
  provider TEXT PRIMARY KEY
  model TEXT NOT NULL
  base_url TEXT NOT NULL
  encrypted_api_key TEXT NOT NULL
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL

projects
  id TEXT PRIMARY KEY
  path TEXT NOT NULL UNIQUE
  name TEXT NOT NULL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL

sessions
  id TEXT PRIMARY KEY
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
  provider TEXT NOT NULL
  title TEXT NOT NULL
  status TEXT NOT NULL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
  INDEX sessions_project_id_idx(project_id)

messages
  id TEXT PRIMARY KEY
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
  role TEXT NOT NULL
  content TEXT NOT NULL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
  INDEX messages_session_id_idx(session_id)
  GIN INDEX messages_content_search_idx(to_tsvector('simple', content))
```

当前实际接入 IPC 的持久化对象是外观设置和 provider 设置。外观主题以 `appearance.theme` 写入 `settings` 表；API Key 由主进程通过 settings repository 写入 `provider_settings.encrypted_api_key`。该列名为兼容既有 schema 保留，新保存值为原始 key；renderer 收到 `hasApiKey` 和 `apiKey`，不再接收 `apiKeyPreview`。`sessions` 与 `messages` 已有 repository，但还没有注册对应 IPC handler；`projects` 目前只保留表结构，等待明确 UI 用例后再接入。

## 7. Renderer 架构

### 7.1 Provider 与路由

`apps/desktop/src/renderer/src/App.tsx` 组合：

```text
App
  -> AppProviders
     -> Zustand stores
     -> AppRouterContextStore.Provider
  -> RouterProvider(appRouter)
```

路由定义：`apps/desktop/src/renderer/src/app/router/index.tsx`

```text
/          -> WorkspaceShell -> HomePage
/chat      -> WorkspaceShell -> ChatPage
/settings  -> SettingsWindowShell -> SettingsPage
```

设置窗口由主进程加载同一个 renderer bundle，并通过 hash `#/settings` 进入独立设置页面。调用 `window.api.windowControls.openSettings({ section: 'providers' })` 时会加载 `#/settings?section=providers`，用于从主窗口直接进入 Provider 设置。

### 7.2 Zustand Store 与实体层

Store 文件：`apps/desktop/src/renderer/src/store`

当前 slice：

- `settings`：维护设置页当前选中的 section、`AppSettings`、加载/保存状态和错误信息。
- `chat`：维护会话、主题、线程、消息、附件和 agent/tool 调用状态。

`AppProviders` 内的 `ThemeController` 会在 renderer 启动后加载一次设置，订阅 `settings:on-change`，并根据 `light`、`dark`、`system` 写入根节点的 `.dark` class 和 `color-scheme`。

settings 领域状态位于 `apps/desktop/src/renderer/src/entities/settings`：

```text
entities/settings/
  config/settings-sections.ts
  model/settings.selectors.ts
  model/settings.types.ts
  model/slices/settings.slice.ts
  model/hooks.ts
```

Provider 表单草稿保留在 `features/ProviderSettings/ProviderSettingsSection.tsx` 组件本地。每个 provider 可以有独立本地覆盖值：没有本地覆盖值的 provider 会跟随持久化设置同步，用户正在编辑但尚未保存的 provider 不会被其他 provider 的保存响应覆盖。

`AppRouterContextStore` 额外维护 `activeChatId`，用于路由上下文级别的轻量状态。

### 7.3 Renderer 分层

Renderer 采用接近 Feature-Sliced Design 的分层：

```text
app
  -> pages
     -> layouts
        -> features
           -> entities
              -> shared
```

依赖方向应尽量从上层指向下层。`shared` 不依赖业务层，`entities` 不依赖 `features/layouts/pages`，`features` 组合实体和 shared UI，`layouts` 组合页面内容和全局导航形成路由/窗口外壳，`pages` 负责路由页面编排。

主工作区 layout：

```text
+---------------------------------------------------------------+
| WorkspaceSidebar | Main route content                         |
|                  |                                           |
| chrome/actions   | HomePage or ChatPage                      |
| primary actions  |                                           |
| more menu        |                                           |
+---------------------------------------------------------------+
```

设置窗口 layout 与页面组合：

```text
+----------------------------------------------------------------+
| SettingsSidebar | SettingsChrome title + window controls       |
| tab list        |----------------------------------------------|
|                 | Scrollable SettingsContent                   |
|                 |----------------------------------------------|
|                 | Footer actions                               |
+----------------------------------------------------------------+
```

`WorkspaceShell` 挂载 `modal-root`、`popover-root`。设置窗口使用 `SettingsWindowShell` 提供独立窗口外框，`SettingsPage` 组合 `SettingsSidebar`、`SettingsChrome`、`SettingsContent` 和 footer。`SettingsContent` 位于 `pages/settings`，根据 active section 分发到 `features/GeneralSettings`、`features/ProviderSettings`、`features/UserInterface` 或占位内容。

## 8. UI 与设计系统

全局样式入口：`apps/desktop/src/renderer/src/styles/main.css`。`components.json` 的 shadcn CSS 配置也指向这个路径，避免工具把样式写回旧目录。

设计系统现状：

- Tailwind CSS v4 的 `@theme` 映射 Moon 语义 token；`tokens.css`、`tokens.dark.css` 和 `recipes.css` 分别维护视觉 token、暗色覆盖和 `.moon-*` 组件 recipe。
- Light mode 使用 parchment、ivory、warm neutral gray 与稀疏 ink blue accent；dark mode 通过 `.dark` token overrides 保留独立暗色调。
- 本地 shadcn primitives 位于 `packages/ui/src/ui`，当前有 `Button` 和 `Tooltip`。
- 图标主要来自 `lucide-react`。
- Radix primitives 用于 Tooltip 和 Slot。

重要约束：

- 优先使用既有 `moon-*` token 和 `.moon-*` recipe，避免在 app UI 中加入零散 Tailwind 视觉尺度。
- 组件优先使用 `@moon/ui` 本地 primitive，而不是直接引入远端或重建一套组件。
- 页面结构分为 `pages`、`layouts`、`features`、`entities`、`components`、`assets` 和 `styles`，避免页面直接承载复杂领域状态。
- `@renderer/components` 和 `@renderer/assets` 仅存放 renderer-only 的复用 UI 与静态资源；跨进程类型必须放在 `@moon/ipc`。
- 自定义窗口按钮必须通过 `window.api.windowControls`，不要在 renderer 中直接调用 Electron。

## 9. 当前实现状态与缺口

已实现：

- 应用启动、主窗口创建、设置窗口单例管理。
- 自定义窗口控制 IPC。
- 设置获取/保存的集中 IPC 契约、Zod 校验、服务层、仓储层和 PGlite/Drizzle 持久化。
- 外观主题保存、启动加载和跨窗口 `settings:on-change` 同步。
- Provider 设置支持 Claude、OpenAI、Gemini、OpenAI Compatible，并在主进程加密保存 API Key。
- 设置页 section 导航、通用设置展示、用户界面主题选择、Provider 表单和占位设置分类。
- 主窗口的“配置提供商”和“设置”按钮会打开独立设置窗口。
- 应用图标从 `apps/desktop/resources/logo.png` 生成，运行时由 `app-icon.ts` 统一选择 macOS Dock 图标和非 macOS BrowserWindow 图标。
- `sessions` 与 `messages` repository 基础能力，包括基于 Postgres full-text search 的消息搜索。
- 主进程、仓储、窗口、renderer 关键 UI 的 Vitest 测试。

尚未接入或仍是占位：

- `HomeEmptyState` 的“新建聊天”按钮还没有实际行为。
- `ChatPage` 目前是占位视图。
- `SessionsRepository` 和 `MessagesRepository` 尚未暴露到 IPC。
- `@tanstack/react-query` 和 `@anthropic-ai/claude-agent-sdk` 已安装，但当前源码未实际使用。

## 10. 测试架构

测试配置：`vitest.config.ts`

- 默认环境为 `jsdom`。
- 测试文件集中位于 `tests/**/*.test.{ts,tsx}`。
- `tests/helpers/renderer/setup.ts` 提供 renderer/jsdom 测试 setup。
- `tsconfig.test.json` 为测试目录提供 TypeScript 项目上下文和测试专用 alias。
- Node-only main 测试使用文件头 `// @vitest-environment node` 覆盖环境。

目录分层：

```text
tests/
  helpers/renderer/              mock-window-api、render-with-providers、setup
  unit/main/                     main process mock 边界测试
  unit/preload/                  preload bridge 测试
  unit/renderer/                 React 页面、layout、slice 测试
  integration/main/              真实 PGlite/repository/bootstrap 测试
```

测试覆盖重点：

- IPC channel 和 handler 注册。
- BrowserWindow 创建参数、应用图标资源选择与设置窗口单例行为。
- 窗口状态事件发布。
- 数据库 migration bootstrap、SettingsRepository 跨数据库连接持久化、外观主题持久化和加密失败回滚。
- Provider 设置表单保存、校验，以及保存单个 provider 时保留其他未保存草稿。
- MessagesRepository Postgres full-text search 索引与搜索。
- Settings 页面布局、滚动区和 section 切换。

建议继续保持“按风险补测试”的策略：新增 IPC、仓储、窗口行为或用户可见 UI 时，增加聚焦回归测试。

## 11. 扩展建议

### 11.1 新增 IPC 能力

建议遵循以下步骤：

```text
1. 在 packages/ipc/src/channels.ts 添加 channel 常量。
2. 在 packages/ipc/src/contracts.ts 添加 request/response 类型和必要 Zod schema。
3. 在 preload/index.ts 暴露最小 window.api 方法。
4. 在 register-ipc.ts 注册 handler。
5. 在 service 层做输入校验和业务编排。
6. 在 repository 层做数据库读写。
7. 在 `tests/unit/` 或 `tests/integration/` 补聚焦测试。
```

### 11.2 扩展 Provider 设置

Provider 设置已经走完整 IPC 和持久化链路。新增 provider 时建议同步修改：

```text
packages/ipc/src/contracts.ts
  providerIds / providerLabels / AppSettings schema

main/db/schema.ts
  provider_settings 不需要新增列，除非 provider 需要额外字段

renderer settings UI
  features/ProviderSettings/ProviderSettingsSection.tsx 表单渲染和必要校验
```

需要注意：Provider 表单草稿按 provider 维度保留本地覆盖值。持久化设置刷新时，没有本地覆盖值的 provider 会直接显示最新设置；保存成功后移除对应覆盖值，避免覆盖其他卡片中尚未保存的输入。

### 11.3 接入项目和会话

已有基础：

- `projects`、`sessions`、`messages` 表，以及 `messages_content_search_idx` 全文搜索索引。
- `SessionsRepository`、`MessagesRepository`。
- `SessionRecord`、`MessageRecord`、`MessageSearchResult` 类型。

下一步应先明确路由和 UI 用例，再暴露 IPC，避免为了“数据层已经有了”而提前扩展 API。

## 12. 构建与运行

常用命令：

```bash
pnpm install
pnpm dev
pnpm build
pnpm build:icons
pnpm lint
pnpm exec vitest run
```

构建链路：

- `electron-vite` 负责编译 main、preload、renderer。
- `electron-builder` 负责平台打包。
- `electron-builder.yml` 当前配置了 macOS、Windows、Linux 目标，把 `apps/desktop/resources/**` 放入 `asarUnpack`，并通过 `extraResources` 携带 `apps/desktop/drizzle/` migration。

图标资源链路：

```text
apps/desktop/resources/logo.png
  -> pnpm build:icons
  -> apps/desktop/resources/icons/{size}x{size}.png
  -> apps/desktop/resources/icon.png
  -> apps/desktop/resources/tray_icon.png + apps/desktop/resources/tray_icon@2x.png
  -> apps/desktop/build/icon.png + apps/desktop/build/icon.icns + apps/desktop/build/icon.ico
```

`scripts/build-icons.mjs` 依赖 macOS 自带的 `sips` 和 `iconutil`，要求源 logo 是至少 1024x1024 的正方形 PNG。运行时 `apps/desktop/src/main/bootstrap/app-icon.ts` 在 macOS 设置 Dock 图标，在 Windows 使用 `apps/desktop/build/icon.ico`，其他非 macOS 平台使用 `apps/desktop/resources/icon.png` 作为 `BrowserWindow` 图标。

## 13. 架构原则

- 主进程拥有系统能力和持久化，renderer 通过 `window.api` 访问能力。
- IPC channel、契约、schema 集中定义在 `packages/ipc/src`，避免字符串散落。
- 服务层负责校验和业务编排，仓储层只做数据读写。
- renderer 以 `app -> pages -> layouts -> features -> entities -> components/assets/styles` 分层组织。
- `packages/shared/src/domain` 只用于跨进程纯领域类型和常量；跨进程 IPC 契约放在 `packages/ipc/src`；基础 UI primitives 放在 `packages/ui/src`；renderer 内业务 UI、样式和资源放在 `apps/desktop/src/renderer/src/components`、`apps/desktop/src/renderer/src/styles` 和 `apps/desktop/src/renderer/src/assets`。
- UI 状态使用 Zustand；跨进程状态以 IPC 和持久化结果为准。
- 只暴露必要 preload API，避免扩大 Electron/Node 能力边界。
- 新能力先定义可验证目标，再补最小测试闭环。
