# Moon 架构设计文档

本文档基于当前 monorepo 结构整理，描述 Moon 的包边界、Electron 进程边界、运行时数据流和扩展约束。

## 1. 总体结构

```text
moon/
  apps/electron/        Electron 桌面应用
    src/main/           主进程：窗口、IPC handler、服务、仓储、PGlite
    src/preload/        contextBridge typed API
    src/ipc/            IPC channel 与 request/response 合同
    src/renderer/src/   React renderer
    tests/              Electron app 测试
    drizzle/            Drizzle migration
    build/              electron-builder 构建资源
    resources/          打包资源和图标

  packages/core/        纯 core 类型：session、message、usage、agent event
  packages/server-core/ 可复用会话运行时：SessionManager、operation 编排、事件落库
  packages/shared/      纯领域类型、默认值、Zod 校验、agent/config 边界
  packages/ui/          本地 shadcn primitives、ai-elements、UI helpers
```

根目录只承载 workspace 元信息和共享工程配置。开发命令通过显式 workspace filter 执行，例如：

```bash
pnpm --filter @moon/electron dev
pnpm --filter @moon/electron build
pnpm --filter @moon/core typecheck
pnpm --filter @moon/server-core typecheck
pnpm --filter @moon/shared typecheck
pnpm --filter @moon/ui typecheck
```

## 2. 包边界

- `@moon/electron` 是唯一应用包，拥有 Electron main/preload/renderer、IPC 合同、数据库 schema、migration 和打包资源。
- `@moon/core` 只放最底层的会话、消息、用量和 agent event 类型；不得依赖 Electron、React、Drizzle、Zod 或具体 SDK。
- `@moon/server-core` 放可复用会话运行时，例如 `SessionManager` 和 sessions handler。它可以依赖 `@moon/core` 和 `@moon/shared`，但不得依赖 Electron、React、renderer、IPC、Drizzle schema 或具体 repository 类；持久化能力通过接口注入。
- `@moon/shared` 只放跨进程共享的纯领域模型、默认值、校验逻辑和 `agent/config` 抽象；不得依赖 Electron、React、Drizzle 运行时代码或 renderer-only 模块。
- `@moon/ui` 只放可复用 UI primitive、ai-elements 和 `cn` 等 UI helper；业务组合继续放在 `apps/electron/src/renderer/src/features`、`components`、`layouts` 等目录。

常用导入约定：

```text
@ipc/...                  apps/electron 内部 IPC 合同
@main/...                 apps/electron 主进程测试/内部引用
@preload/...              apps/electron preload 测试/内部引用
@renderer/...             apps/electron renderer 内部引用
@tests/...                apps/electron 测试 helper
@moon/core/types            core session/message/agent event 类型
@moon/server-core/sessions  server runtime 的 SessionManager 和 sessions handler 入口
@moon/shared/agent          agent backend 抽象入口
@moon/shared/config         LLM connection 配置模型
@moon/shared/domain/...   workspace shared 领域模型
@moon/ui/ui/...           shadcn UI primitives
@moon/ui/ai-elements/...  ai-elements primitives
@moon/ui/lib/utils        cn(...)
```

## 3. Electron 进程边界

```text
renderer feature
  -> window.api.*
  -> preload typed invoke
  -> ipcMain handler
  -> Electron service facade
  -> @moon/server-core sessions handler
  -> @moon/server-core SessionManager
  -> repository
  -> PGlite/Drizzle
  -> typed response
```

- `apps/electron/src/main/` 拥有 Electron API、窗口生命周期、IPC handler 注册、PGlite/Drizzle、repositories、services 和 provider proxy。
- `apps/electron/src/main/services/` 保留 Electron main service 门面；会话运行时编排应优先下沉到 `@moon/server-core`。
- `apps/electron/src/preload/` 只暴露窄 typed bridge，不承载业务逻辑或持久化逻辑。
- `apps/electron/src/ipc/` 是 app 内跨进程协议层，定义 channel、request/response 类型和窗口相关 schema。
- `apps/electron/src/renderer/src/` 只通过 `window.api` 访问主进程，不直接依赖 Electron、Node、数据库或 main-process 模块。

## 4. Renderer 组织

Renderer 依赖方向保持：

```text
app -> pages -> layouts -> features -> entities -> components/assets/styles
```

- 路由注册在 `apps/electron/src/renderer/src/app/router/index.tsx`。
- 需要 shell 边界的 route host 放在 `apps/electron/src/renderer/src/app/router/route-hosts.tsx`。
- 页面级组合放在 `pages/`，可复用业务块放到 `layouts/`、`features/`、`entities/` 或 renderer-only `components/`。
- 全局样式入口是 `apps/electron/src/renderer/src/styles/main.css`，其中 Tailwind `@source` 覆盖 renderer 源码和 `packages/ui/src`。
- shadcn 配置位于 `apps/electron/components.json`，生成目标通过 alias 指向 `packages/ui/src`。

## 5. Persistence

- Schema 位于 `apps/electron/src/main/db/schema.ts`。
- 数据库连接和 migration bootstrap 位于 `apps/electron/src/main/db/`。
- Repository 位于 `apps/electron/src/main/repositories/`。
- Migration 文件位于 `apps/electron/drizzle/`。
- 打包时 `apps/electron/electron-builder.yml` 通过 `extraResources` 携带 `drizzle/`，运行期 `getMigrationsFolder()` 在 packaged 与开发环境之间选择正确路径。

## 6. Verification

推荐迁移或边界改动后至少运行：

```bash
pnpm --filter @moon/core typecheck
pnpm --filter @moon/shared typecheck
pnpm --filter @moon/shared test
pnpm --filter @moon/server-core typecheck
pnpm --filter @moon/ui typecheck
pnpm --filter @moon/electron typecheck
pnpm --filter @moon/electron test
pnpm --filter @moon/electron build
```

Electron app 测试位于 `apps/electron/tests/`；shared-domain 测试位于 `packages/shared/tests/`。
