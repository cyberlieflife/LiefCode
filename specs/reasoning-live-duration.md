# 对话思考块的实时秒数

## 产品规则

- 模型思考块在运行态（`row.state === "streaming"`）显示已用秒数，秒数按 1 秒粒度刷新。
- 收起态文案为「正在思考 · N 秒」；展开态沿用「思考 · 持续了 N 秒」。
- 思考结束后文案恢复完成态「思考 · 持续了 N 秒」；服务端提供 `durationMs` 时以服务端
  时长为最终值，客户端只负责运行中的近似计时。
- 客户端计时从首个思考内容到达（组件挂载）开始，最多比模型真实思考起点晚首 token 的
  等待时间；结束后以 `row.durationMs` 校正。
- 秒数从 1 开始显示，避免首帧出现「0 秒」。
- 分享只读时间线不处于运行态，不显示实时秒数。

## 状态所有者

```
ReasoningRow.state / durationMs（服务端快照）
  → ReasoningRowView 传 isStreaming 与完成态 duration
    → Reasoning.startTimeRef（运行态起点，客户端本地）
      → Reasoning.duration（运行态每秒更新；完成时被 duration prop 覆盖）
        → ReasoningTrigger 文案
```

- 运行态计时由 `Reasoning` 组件独占；不向父层新增状态或定时器。
- 收起/展开共享同一个起点与 `duration`，切换展开状态不会重置计时。

## 接口

- `ReasoningProps.duration`：完成态时长（秒），优先于客户端计时结果。
- 新增 i18n key `chat.reasoning.elapsedSeconds`：`{seconds} 秒` / `{seconds}s`。

## 验收场景

1. 思考流式输出且默认收起：文案每秒从「正在思考 · 1 秒」递增。
2. 流式过程中展开 / 收起：秒数连续，不归零、不回退。
3. 思考结束：文案变为「思考 · 持续了 N 秒」，N 取服务端时长。
4. 英文界面：对应文案为「Thinking · 1s」等。
5. 历史会话与分享只读视图：不出现运行态计时。
