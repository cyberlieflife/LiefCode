# pet

Codex 兼容的环境宠物系统：解析 `pet.json` / `avatar.json`，合并内置与自定义来源，
在独立桌面窗口渲染动画与任务卡。

## 意图

- 用户已有的 Codex 自定义宠物（`~/.codex/pets/<id>`、`~/.codex/avatars/<id>`）
  无需转换即可使用。
- 内置宠物资源与 Codex TUI 一样按需从官方 CDN 获取，不随仓库分发。
- 任务卡以焦点 workspace 的 sessions-index 为唯一事实源，焦点会话的实时 phase 与
  流式正文由 conversation snapshot 覆盖；不新增第二份运行态。sessions-index 对流式正文
  按窗口合并发布，后台会话的小字同样能跟到当前输出。
- 任务卡最多 3 条，按最近活动时间降序；running / waiting 常驻，failed 1 小时，
  review 10 分钟。动画状态按 waiting > failed > running > review > idle 选择。
- 归档过滤、点击跳转与本地关闭都只作用于展示层：主窗口提供归档 taskId 集合与已本地化
  控件名称，宠物窗口负责折叠状态和已结束卡片的即时隐藏。

## 不变量

- 精灵表固定 1536 × 1872（8 列 × 9 行，每帧 192 × 208）；帧网格必须恰好覆盖整张图。
- 自定义清单的 `spritesheetPath` 只能指向宠物目录内部，绝对路径与 `..` 一律拒绝。
- 关闭宠物使用 `disabled`，与“未配置”区分；已保存的选择永不自动改写。
- 单个 provider 失败只影响自身，内置宠物始终可用。

## 扩展点

- `registerPetProvider({ id, list })`：合并新的宠物来源，返回注销函数。
- `parseCodexPetManifest` / `buildDefaultPetAnimations` / `resolvePetFrame`：
  给第三方格式适配器复用同一套校验与帧算法。
- `<DesktopPetView>`：独立桌面窗口的展示层，接收宠物、任务卡、状态与拖动桥。
- `<PetDesktopStatusPublisher>`：把宠物定义、焦点 workspace 的任务卡与交互
  设置同步给主进程。
- 设置页通过 `<PetSettingsSection />` 嵌入外观分区。

## 与其它模块的交集

- `packages/ui/src/store/index.ts` 组合 `storeSlice.ts`，登记四个广播字段
  （`petId`、`petAnimationsEnabled`、`petDesktopEnabled`、`petSizePx`）。
- `SessionPane` 在焦点 pane 中挂载 `PetDesktopStatusPublisher`，把焦点 workspace 的
  sessions-index 与当前会话快照转成桌面宠物任务卡。
- `settingsCodePreview.tsx` 在外观分区渲染 `PetSettingsSection`。
- Desktop main 的 `desktopPetWindow` 创建独立置顶窗口；`desktopPetIpc` 校验来源并转发状态。
