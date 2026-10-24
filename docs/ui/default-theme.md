# 默认主题

## 当前策略

- 应用首次启动且本地没有 `zcode-theme` 持久化值时，默认配色方案为 `zai-dark`。
- 本地没有 `zcode-style-theme` 时，默认 UI 方案为 `default`；旧的 Claude 配色在缺少 UI 方案偏好时迁移为 `claude`。
- 一旦用户主动切换配色方案或 UI 方案，后续仍然优先读取本地保存值，不会被默认值覆盖。

## 实现位置

- Zustand store 默认值：`packages/ui/src/store/index.ts`
- 旧 `useTheme()` hook 兜底值：`packages/ui/src/useTheme.ts`
