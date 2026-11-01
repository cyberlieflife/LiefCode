# SuperAgent 迁移总览

本目录记录 `dsh-superagent-prototype` 迁移到本仓库的设计与实施边界。原型来源：`deepseek-ai/dsh-superagent-prototype`（MIT），全部 8 篇设计文档、提示词、技能、面板与测试按模块移植。

## 已确认的前提

- 运行时生命周期：仅在桌面 App 运行期间工作，关窗或退出即停止轮询与派工。
- 路由数量：一个 workspace 最多一个 SuperAgent 会话。
- 首批 Source：GitHub 与飞书。
- Worker 权限：无人值守全权限，默认关闭，需在设置中显式开启。

## 层与落点

| 层 | 路径 | 职责 |
| --- | --- | --- |
| 领域引擎 | `apps/zcode-cli/packages/superagent/` | Trigger、Thread、Eval、Ticket、Assignment 的纯状态机，无 I/O |
| 存储 | `apps/zcode-cli/packages/adapters/src/storage/superagent-store/` | 独立 SQLite 与迁移，唯一写者 |
| 应用层 | `apps/zcode-cli/packages/bootstrap/src/app/superagent/` | effects、outbox、passes、settings、prompts、health |
| 执行器 | `bootstrap/src/app/superagent/worker-driver.ts` | 把工单落到 `superagent_worker` 子会话 |
| Source | `apps/zcode-cli/packages/superagent-sources/` | GitHub、飞书的轮询、翻译、回复 |
| 协议 | `packages/shared/src/zcode-protocol-v4/superagent.ts` | 面板读写契约与运行时校验 |
| 面板 | `packages/ui/src/superagent/` | 六个页签与操作 |
| 提示词 | `bootstrap/src/app/superagent/prompts/` | 角色、工作、交回、生成段 |
| 技能 | `apps/zcode-cli/packages/superagent-skills/` | github、feishu 两个技能 |
| 文档 | `docs/superagent/` | 原型文档移植与本仓库差异说明 |

## 所有权与事件顺序

```text
Source 轮询 → Engine.receive（唯一写者，事务）
           → Decision / Ticket 状态
           → Effects 入队（同事务）
           → 提交后执行 launch / delivery / relay / notice / reply
           → 面板通过 superagent/<routerId> 事件流读取投影
```

- 领域状态只由 Engine 写入，Source、Worker 驱动、面板都通过命令进入。
- 每个 Effect 以 `(kind, key)` 幂等，失败指数退避。
- 面板只读快照与增量，不做本地权威状态。
- 同一 workspace 多个 Host 时用 `runtime_lease` 保证只有一个执行者。

## 阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | spec、ADR、模块登记 | 完成 |
| 1 | 会话模式、默认模式设置、旧会话兼容 | 完成 |
| 2 | 存储与领域引擎、effects/outbox/passes | 完成 |
| 3 | Worker 执行器 | 完成（prepare、并发槽、无人值守权限） |
| 4 | GitHub 与飞书 Source | 完成（飞书依赖兼容包装脚本） |
| 5 | Policy 与授权 | 完成（准入表、Mandate、accept mode、版本重验证） |
| 6 | 面板 | 完成（六页签，轮询快照） |
| 7 | 提示词版本化 | 完成（团队段、覆盖、占位符校验） |
| 8 | 运维与收尾 | 部分（健康、暂停、使用指南；无常驻后台与独立 CLI 守护进程） |

使用方式见 [usage.md](usage.md)，程序内入口是设置页「默认会话模式」行的使用指南按钮与会话面板的「指南」页签；引擎与副作用见 [020-engine.md](020-engine.md)。

## 与原型的有意差异

- 不引入插件机制：新模块在 bootstrap 启动时装配，不移植 `cordis.patch.yml`。
- Executor 从 DSH Session 换成仓库现有的 `AgentRuntime` 子会话。
- 面板不复制原型样式，使用本仓库设计令牌与组件。
- 环境变量前缀保留 `DSH_SUPERAGENT_` 语义，改为 `LIEF_SUPERAGENT_` 前缀以免与旧脚本冲突。
