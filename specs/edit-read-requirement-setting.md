# 设置：取消"编辑前必须读取文件"的要求

## 产品规则

- Agent（Edit/Write 工具）修改已存在文件前，默认必须先用 Read 读取过；未读过直接报
  "File has not been read yet. Read it first before writing to it."。
- 设置页"通用"分区提供开关「取消编辑前读取要求」，**默认关闭**（保持强制读取）。
- 开关打开后：未读过的文件允许直接 Edit/Write；已读过文件的"读后内容被外部修改则拒绝"
  （STALE）保护保留。
- 旧版本 CLI 不认识同步协议方法，method-not-found 自动忽略，行为不变。
- TUI/headless 等不经协议的入口保持默认（强制读取）。

## 状态所有者

```
AppSettings.editRequiresReadEnabled（持久化事实，默认 true）
  → appRuntimePreferences.editRequiresReadEnabled（Host/CLI 进程级缓存）
    → ZCodeApp.setEditRequiresReadEnabled → runtime.config.editRequiresReadEnabled（session 内运行态）
      → ToolExecutor getter → ToolExecutionContext.editRequiresReadEnabled（每次工具调用取当下值）
```

- 语义方向为正向 `editRequiresReadEnabled`（true = 要求先读），缺省/undefined 一律按 true 兼容；
  UI 开关取反向显示（checked = !editRequiresReadEnabled）。
- 设置值经既有 App Runtime Preferences 广播通道跨窗口同步，UI 不持有第二份事实。

## 协议接口

- 方法：`workspace/updateEditReadPolicy`
- params：`{ workspace: WorkspaceRef, editRequiresReadEnabled: boolean }`（strict）
- result：`{ workspace: WorkspaceRef, editRequiresReadEnabled: boolean, updatedSessionCount: number }`
- Host 同步挂在 `syncAppRuntimePreferences` 的偏好串行队列尾部，仅 method-not-found 降级忽略。

## 验收场景

1. 默认配置（开关关闭）：Agent 编辑未读过的文件被拒，提示先 Read。
2. 打开开关：当前活跃会话立即生效——Agent 直接 Edit 未读过的文件成功。
3. 已 Read 后文件被外部修改：无论开关状态，Edit/Write 仍拒绝（STALE 保护）。
4. 关闭开关：恢复强制读取。
5. 跨窗口：另一窗口打开的设置页开关状态一致（广播同步）。
