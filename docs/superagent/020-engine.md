# 引擎、存储与副作用

## 所有权

- `apps/zcode-cli/packages/superagent` 是纯领域包：Trigger、Thread、Eval、Decision、Ticket、Assignment、Report 的状态机，不读写文件、不发网络请求。
- `apps/zcode-cli/packages/adapters/src/storage/superagent-store` 是唯一写者，SQLite 库默认在 `<storageRoot>/cli/superagent.sqlite`。
- `apps/zcode-cli/packages/bootstrap/src/app/superagent` 负责装配：effects 队列、Source 轮询、Worker 执行器、提示词与健康状态。
- 面板通过 v4 会话命令读写，不直接接触存储。

## 事件顺序

```text
Source.poll → Engine.receive（去重、建 Thread、扇出订阅）
           → Engine.evaluateDue（到期 Eval、待派工 Ticket、待投递 Input）
           → Effect 入队（与状态变更同一次调用）
           → Effect 执行：assessment / launch / delivery / relay / notice / reply
           → 执行结果回写 Engine（decision / assignmentStarted / inputsDelivered / report）
```

- `receive` 对同一 Trigger id 幂等，重复投递返回 `duplicate`。
- 人的跟进消息只送给订阅该 Thread 的 Ticket，不再进入 Eval；Bot 与 CI 消息不会唤醒已结束 Ticket。
- 同一 Thread 同时只有一个 Eval；重复到期先重排，第三次记 `unavailable`。
- `deliveredAt` 在评估 effect 入队时写入，避免同一批候选被反复评估；人工「重新评估」会清空它。

## Effect 语义

| kind | 失败处理 |
| --- | --- |
| `assessment` | 2s 起指数退避，三次后记 `unavailable` |
| `launch` | 槽满重试不记错；真实失败三次后 Ticket 记 `failed` |
| `delivery` | 三次失败后停止重试，Ticket 显示投递失败 |
| `relay` / `notice` | 注入路由会话，失败退避 |
| `reply` | 来源返回 `gone` 视为完成，其余错误重试 |

非失败的重试通过 `LaterError` 表达，不进入健康告警。

## 并发与恢复

- Worker 槽位由执行器维护，默认上限来自设置，额外保留一个人工槽。
- 同一 workspace 用 `runtime_lease` 互斥；未持有租约的 Host 只读。
- 重启后遗留的 `pending` Assignment 会重新入队 launch；Worker 目录与 Ticket 状态都来自数据库。

## 已知简化

- 失败退避在单进程内串行执行，没有原型的多并发 effect 消费。
- 模型评估端口默认使用规则关键词实现；替换为模型调用不需要改 Engine。
- PR 跟随只做到「线程关闭即结束工单」，没有原型的合并条件与 review thread 轮次控制。
