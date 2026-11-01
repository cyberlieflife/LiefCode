# 会话模式：agent 与 superagent

## 目标

同一个会话可以在传统 Agent 模式与 SuperAgent 路由模式之间切换。新会话默认模式由设置决定。历史会话在没有该字段时按 `agent` 处理，行为不变。

## 概念与所有权

- `agentMode` 是会话配置的一部分，归会话运行时所有，随会话持久化。
- `superagent` 模式下的会话即原型中的 Main Session（Router），负责接单、派单、汇总。
- 工单（Ticket）与 Worker 子会话不属于会话配置，归 SuperAgent 领域引擎所有。
- Renderer 只保存草稿与乐观展示，不持有模式事实。

## 数据模型

| 位置 | 字段 | 说明 |
| --- | --- | --- |
| `SessionConfigState` | `agentMode: "agent" \| "superagent"` | 投影值，缺省 `agent` |
| `session_entry` | `runtime/superagent_router` | 持久事实 `{ enabled, routerId, policyVersion, createdAt }` |
| `sessions-index` | `sessionSummary.agentMode?` | 可选字段，旧客户端忽略；列表徽标只读它，不改 tasks-index |
| `AppSettings` | `defaultSessionMode?: "agent" \| "superagent"` | 新会话默认值，默认 `agent` |

不新增 `session` 表列，避免改动基线 schema。模式的持久事实放在现有可扩展的 `session_entry`。

## 命令与事件

```text
switchAgentMode { sessionId, agentMode, baseRevision, endOpenTickets? }
  → CommandInbox 准入（同会话 FIFO）
  → handler 校验转换规则
  → 写 session_entry
  → append SessionAgentModeChanged { from, to, reason }
  → ProductProjection 更新 config.agentMode
  → sessions-index 与 tasks 徽标更新
```

- 命令带 `baseRevision`，与现有配置命令一致走 CAS；冲突时返回最新快照，不丢弃草稿。
- `SessionAgentModeChanged` 是新事件类型，不复用协作模式（build/plan）的 `SessionModeChanged`。
- 事件在 turn 之外发生，不推进 turn 状态机。

## 转换规则

| 方向 | 条件 | 结果 |
| --- | --- | --- |
| agent → superagent | 当前 workspace 没有其它 router | 创建 router 记录，启用路由提示词与工具 |
| agent → superagent | 同 workspace 已有 router | 拒绝，返回已有 router 的 sessionId |
| superagent → agent | 没有开放工单与运行中的 Assignment | 停用 router，会话回到普通工具集 |
| superagent → agent | 存在开放工单 | 拒绝；带 `endOpenTickets: true` 时结束全部工单（原因 `mode_switched`）后降级 |
| 任意 | 会话处于远程 workspace | 拒绝，首期只支持本地 workspace |

- 降级不删除 SuperAgent 数据；再次升级时沿用原 router 记录。
- 升级后会话驻留被固定，避免空闲回收中断 Source 轮询。

## 默认模式设置

- 读取点：新建任务草稿（`draftConfig` 在草稿未显式选择时取设置默认值，随 `createSession.config` 提交）。
- 预热会话可能早于设置变更创建；首发前用 `switchAgentMode` 补同步，失败只告警不阻断发送，并提示「当前 workspace 已有 SuperAgent 会话」。
- 其他创建路径（bot、已保存工作流启动等）在阶段 1 仍按 `agent` 创建；阶段 2 接入引擎时统一改走同一个解析入口。
- 设置变更只影响之后创建的会话，不回写已有会话。
- 写入走现有 `useSettings().update`，跨窗口由 `SettingsChanged` 广播同步。
- 旧草稿缺少字段时回退 `agent`。

## 旧会话兼容

1. 没有 `runtime/superagent_router` entry 的会话一律 `agent`。
2. 列表只消费 `sessions-index` 的可选 `agentMode`，tasks-index 结构不变，不需要迁移。
3. 协议字段可选，旧客户端不传时按 `agent`。
4. 会话列表、搜索、归档、分叉、子会话展示均不受影响。
5. 功能关闭时 router 会话按 `agent` 加载，SuperAgent 数据保留。

## 验收场景

- 新建会话使用设置默认值 `superagent`，标题栏显示徽标，重启后仍为 `superagent`。
- `agent → superagent → agent` 往返后，transcript 与原工具集完整。
- 存在开放工单时降级被拒绝；携带 `endOpenTickets` 时工单全部结束且 worker 停止。
- 旧 fixture 会话冷启动后 `agentMode` 为 `agent`，事件流无新增类型。
- 旧 tasks-index 数据库执行迁移后，列表徽标显示为 `agent`。
- 两个窗口打开同一 workspace 时，只有持有 lease 的一端能转换与派工。
