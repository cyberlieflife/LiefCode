/** Codex 宠物精灵表的固定几何：8 列 × 9 行，每帧 192 × 208。 */
export const PET_FRAME_WIDTH = 192;
export const PET_FRAME_HEIGHT = 208;
export const PET_FRAME_COLUMNS = 8;
export const PET_FRAME_ROWS = 9;
export const PET_SPRITESHEET_WIDTH = PET_FRAME_WIDTH * PET_FRAME_COLUMNS;
export const PET_SPRITESHEET_HEIGHT = PET_FRAME_HEIGHT * PET_FRAME_ROWS;

/** 与 Codex 解析器一致的上限：最多 256 帧，动画帧率不超过 60。 */
export const PET_MAX_FRAMES = 256;
export const PET_MAX_FPS = 60;
export const PET_DEFAULT_FPS = 8;
export const PET_DEFAULT_SPRITESHEET = "spritesheet.webp";

/** Codex 未配置宠物时的默认 id；关闭宠物使用独立的 disabled 值。 */
export const PET_DEFAULT_PET_ID = "codex";
export const PET_DISABLED_ID = "disabled";
export const PET_CUSTOM_PREFIX = "custom:";

/** 桌面端宠物显示高度。宽度由 192:208 的帧比例决定。 */
export const PET_DISPLAY_HEIGHT_PX = 132;

/** Codex 的 8 个内置宠物。资源按需从官方 CDN 获取，不随仓库分发。 */
export const PET_ASSET_CDN_BASE = "https://persistent.oaistatic.com/codex/pets/v1";

/**
 * Codex 兼容的宠物目录。自定义宠物完全归用户所有：
 * 优先读取新版 `pets/<id>/pet.json`，其次兼容旧版 `avatars/<id>/avatar.json`。
 * `.zcode/pets` 是本项目的扩展目录，格式与 Codex 完全一致。
 */
export const PET_CODEX_HOME_SOURCES = [
  { dir: ".codex/avatars", manifest: "avatar.json", label: "Codex avatars" },
  { dir: ".codex/pets", manifest: "pet.json", label: "Codex pets" },
  { dir: ".zcode/pets", manifest: "pet.json", label: "ZCode pets" },
] as const;

export type PetNotificationKind = "running" | "waiting" | "review" | "failed";

export interface PetFrameSpec {
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export interface PetAnimationFrame {
  spriteIndex: number;
  durationMs: number;
}

/**
 * 一条命名动画。`loopStart` 为 null 表示一次性动画，播放完后切换到 `fallback`；
 * 非 null 时先播放前缀，再无限循环 `frames[loopStart..]`。
 */
export interface PetAnimation {
  frames: PetAnimationFrame[];
  loopStart: number | null;
  fallback: string;
}

export interface PetDefinition {
  id: string;
  displayName: string;
  description: string;
  /** builtin、codex-home 或第三方 provider 的自定义来源标识。 */
  source: string;
  /** 可直接用于 CSS background-image 的地址（CDN 或 data URL）。 */
  spritesheetUrl: string;
  frame: PetFrameSpec;
  frameCount: number;
  animations: Record<string, PetAnimation>;
}

/** 解析器只需要会话快照中的运行态、阻塞交互和最近一条助手正文。 */
export interface PetSnapshot {
  sessionId: string;
  control: {
    phase: string;
    lastError: { code: string; message: string; at: number } | null;
  };
  pendingInteractions: ReadonlyArray<{
    interactionId: string;
    payload: { kind: string };
  }>;
  rows: {
    window: ReadonlyArray<{
      rowId: number;
      kind: string;
      text?: string;
    }>;
  };
}

export interface PetNotification {
  kind: PetNotificationKind;
  /** 为空时使用该状态的固定文案；Review 可带最终回答摘要。 */
  body: string | null;
  startedAt: number;
}

/** 桌宠任务卡：标题、当前输出与状态文件；发布到 Main 前补齐过期时间。 */
export interface PetTaskCard {
  taskId: string;
  kind: PetNotificationKind;
  title: string;
  detail: string;
  lastActivityAt: number;
  expiresAt: number;
}

/**
 * 任务卡展示窗口。running / waiting 由会话状态变化移除，不按时间过期；
 * failed 与 review 只保留最近一段活动时间，避免历史任务长期占位。
 */
export const PET_TASK_CARD_LIFETIME_MS: Record<PetNotificationKind, number | null> = {
  running: null,
  waiting: null,
  failed: 60 * 60 * 1000,
  review: 10 * 60 * 1000,
};

export interface PetHostDirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

/**
 * 宠物系统只需要宿主的四个文件能力。UI 层通过这个窄端口访问宿主，
 * 不直接依赖 Service 实现；桌面、Web 和远程 host 各自在适配层实现。
 */
export interface PetHostPort {
  homeDirectory(): Promise<string | null>;
  listDirectory(path: string): Promise<PetHostDirectoryEntry[]>;
  readTextFile(path: string, maxBytes: number): Promise<string>;
  readAsset(path: string, maxBytes: number): Promise<{ mediaType: string; dataBase64: string }>;
}

export interface PetProviderContext {
  host: PetHostPort;
}

/**
 * 宠物来源扩展点。宿主或插件注册后，选择器会自动合并其返回的宠物定义。
 * provider 抛错不会影响其它来源，调用方只记录告警。
 */
export interface PetProvider {
  id: string;
  label?: string;
  list(context: PetProviderContext): Promise<PetDefinition[]>;
}
