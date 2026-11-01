# SuperAgent 使用指南

程序内入口：设置 → 通用 →「默认会话模式」行右侧的「使用指南」按钮，打开即读，不需要先切换模式；已经在 SuperAgent 会话里时，面板顶部的「指南」页签提供同一份内容。

SuperAgent 把一个会话变成常驻的路由器：它从 GitHub 或飞书接收请求，判断是否接单，把接单的工作派给独立的 Worker 会话，再把结果发回原对话。你只需要处理需要人决定的事。

运行时只在桌面 App 打开期间工作。关闭窗口或退出应用会停止轮询与派工，重新打开后按持久化状态继续。

## 1. 打开一个 SuperAgent 会话

1. 在设置 → 通用里选择「默认会话模式」。选 `SuperAgent` 后，新建会话默认进入该模式；选 `传统 Agent` 则保持旧行为。
2. 已经存在的会话可以在输入框左下角的模式下拉里切换，不必新建。
3. 一个 workspace 同时只允许一个 SuperAgent 会话。已有路由器时，切换第二个会话会被拒绝，先切回传统 Agent 再试。

切换只影响该会话：历史消息、模型选择和已有工单都不会丢。降级前如果还有开放工单，需要先结束它们；会话模式命令携带结束意图时，工单会以 `mode_switched` 结束。

## 2. 面板

处于 SuperAgent 模式的会话右上角会出现 `SuperAgent` 按钮，点开后是六个页签：

| 页签 | 看什么 |
| --- | --- |
| 总览 | 需要人处理的工单数、系统健康、最近决定 |
| 来源 | GitHub 与飞书的运行开关和账户信息 |
| 触发 | 正在订阅的线程与事件数 |
| 评估 | 策略版本、接单模式和每次评估的结论 |
| 执行 | 工单阶段，以及重试、停止操作 |
| 设置 | 并发数、执行目录、prepare 命令、Policy 与提示词 |

面板每 5 秒刷新一次，执行操作后也会立即刷新。数据来自当前会话自己的 SuperAgent 运行时，不经过全局缓存。

来源配置在「设置 → 来源配置」的 sources JSON 里编辑。保存时只校验已启用的来源，未启用的来源可以保留空配置，不会影响其它来源保存。

## 3. 工单阶段怎么读

| 阶段 | 含义 | 你该做什么 |
| --- | --- | --- |
| `person/delivery` | 输入没有送达 Worker | 面板点重试 |
| `person/answer` | Worker 提了一个问题 | 在原对话回答 |
| `person/review` | 工作完成，等待评审 | 看 PR 或结果，合并或提意见 |
| `person/blocked-failed` | Worker 受阻或失败 | 看报告，决定重试或停止 |
| `working/queued` | 已接单，等待执行槽 | 无需操作 |
| `working` | 正在执行 | 无需操作 |
| `idle` | 本轮结束，等待新事件 | 无需操作 |

人在工单自己的线程里说话，会直接唤醒该工单，不需要重新评估。不能恢复已经被你停止的工单。

## 4. 配置 GitHub

1. 确保 `gh` 已登录一个有仓库写权限的账号。建议给 Agent 单独建一个账号，并把它的 CLI 配置隔离出来。
2. 在面板「设置 → 来源配置」的 sources JSON 中填写 `repository`（`owner/name`）和 `cli`（默认 `gh`），然后保存。需要仓库内所有 Issue/PR 时再打开 `observeIssues` / `observePulls`。
3. 回到「来源 → GitHub」启用来源。`repository` 不是 `owner/name` 时启用按钮保持禁用，避免保存必然失败的配置。
4. 评估页签里确认接单模式。新安装默认是 `observe`：模型会评估候选，但只记录「would accept」，不会真的接单。观察几天后再切到 `auto`。

Agent 通过 `gh` 评论、推送分支、开 PR。默认不会自动合并；需要自动合并时，在提示词的「交付」段写明条件与使用的账号。

## 5. 配置飞书

飞书依赖一个与 `lark-cli` 兼容的包装脚本，约定三个子命令：

```text
<cli> poll  --chat <chatId> [--after <cursor>] --json
<cli> reply --message <messageId> --key <idempotencyKey> --text <text>
<cli> thread --chat <chatId> --root <messageId> --json
```

`poll` 返回 `{"items":[...],"next":"..."}`，条目包含 `id`、`chat_id`、`root_id`、`sender{id,type}`、`text`、`create_time`、`mentions_me`。`reply` 在目标永久不可达时以非零退出并在 stderr 写 `gone`，其余错误会被重试。

在面板「设置 → 来源配置」的 sources JSON 里填写 `cli`、`chats`（`chatId`、`name`、`listen: "mentions" | "all"`）以及是否接收私信，保存后到「来源 → 飞书」启用。`listen: "all"` 的会话里，没点名 Agent 的消息也会进入准入判断；其他会话默认只看点名。

## 6. 授权与安全

- **准入**：只有允许名单里的人点名 Agent，或者规则明确允许的推断候选，才会接单。名单在 Policy 的 `sources.<source>.allowed` 里维护。
- **接单模式**：`off` 只接受显式点名；`observe` 评估但不接单；`auto` 命中已启用规则才接单。推断候选永远不会绕过规则。
- **Worker 权限**：Worker 以无人值守方式运行，默认需要你在设置里显式开启。它使用当前操作系统账号的权限，`blockedCommands` 只是约定，不构成安全边界。需要隔离时请使用独立的系统账号。
- **凭据**：GitHub 通过 `gh` 自己的配置读取凭据，飞书通过包装脚本读取。环境变量里不放凭据。
- **停止**：面板里的停止是人工命令，立即结束工单并撤回本轮授权；线程里说「停止」则走正常评估。

## 7. 提示词

设置页签的「提示词」有三段团队文本：沟通方式、工单范围、交付要求。保存后会生成新版本，Worker 下一次请求就读取新版本；已在运行的会话不会被重启。

覆盖内置部件时，`runtime/environment`、`runtime/policy` 等生成段必须保留占位符（例如 `{variables}`、`{rules}`），否则保存会被拒绝，避免提示词在升级后静默丢字段。

## 8. 常见问题

**面板一直显示「读取中」**
当前构建没有装配 SuperAgent 运行时，或会话不是 `superagent` 模式。先确认输入框左侧的模式控件显示 `SuperAgent`。

**GitHub 没有新事件**
`gh api /notifications` 只返回当前账号的未读通知；编辑已有 Issue 正文不会产生新通知，需要新增评论。确认 `gh auth status` 与仓库权限。

**工单一直停在 `working/queued`**
并发槽已满或 Worker 执行器没有配置。打开执行页签查看健康条目；调大并发数或停止一个工单。

**接单后没有回复**
回复依赖来源通道。GitHub 会检查评论是否成功；飞书在目标会话被删除或消息被撤回时记为 `gone`，不会无限重试。

**同一个 workspace 提示已有路由器**
同一 workspace 只允许一个 SuperAgent 会话。先把它切回传统 Agent，或继续使用已有会话。

## 9. 当前边界

- 只在桌面 App 运行期间工作，没有常驻后台服务。
- 不支持在远程 workspace 里开启 SuperAgent。
- 面板数据是轮询快照，还没有实时增量推送。
- 模型评估可以替换为真正的模型判断；当前默认实现是规则关键词匹配，显式请求不受影响。
