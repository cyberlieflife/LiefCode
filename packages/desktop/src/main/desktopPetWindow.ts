import type { PetDesktopPet, PetDesktopStatus } from "@zcode/shared";
import { PET_DESKTOP_MAX_TASKS, PlatformChannels } from "@zcode/shared";

export interface DesktopPetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 桌面宠物窗口的最小能力面；测试可注入替身，不影响真实 Electron 窗口。 */
export interface DesktopPetWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  showInactive(): void;
  hide(): void;
  destroy(): void;
  setPosition(x: number, y: number): void;
  getBounds(): DesktopPetBounds;
  setBounds(bounds: DesktopPetBounds): void;
  setAlwaysOnTop(flag: boolean, level?: "floating" | "screen-saver"): void;
  send(channel: string, payload: unknown): void;
  onceReadyToShow(callback: () => void): void;
  on(event: "closed", callback: () => void): void;
  getWebContentsId(): number;
  popupMenu?(): void;
}

export interface DesktopPetWindowController {
  updatePet(pet: PetDesktopPet | null): void;
  updateStatus(status: PetDesktopStatus): void;
  resetPosition(): void;
  /** 按渲染内容调整窗口大小，保持右下角锚点，用户可继续拖动。 */
  resize(width: number, height: number): void;
  handleDrag(phase: "start" | "move" | "end"): void;
  activateMain(): void;
  /** 恢复主窗口并请求切换到指定会话。 */
  activateTask(taskId: string): void;
  showContextMenu(): void;
  getSnapshot(): { pet: PetDesktopPet | null; status: PetDesktopStatus | null };
  isPetWindowSender(webContentsId: number): boolean;
  shouldKeepAppRunning(): boolean;
  dispose(): void;
}

export interface DesktopPetWindowControllerOptions {
  createWindow(bounds: DesktopPetBounds): DesktopPetWindow;
  /** 主进程读取系统光标；渲染器坐标会随窗口移动产生累积漂移。 */
  getCursorPoint(): { x: number; y: number };
  getPrimaryWorkArea(): DesktopPetBounds;
  getWorkAreaForBounds(bounds: DesktopPetBounds): DesktopPetBounds;
  loadPosition(): { x: number; y: number } | null;
  savePosition(position: { x: number; y: number }): void;
  /** 传入 taskId 表示恢复后还要切到该会话。 */
  ensureMainWindow(taskId?: string): Promise<void> | void;
  showContextMenu(window: DesktopPetWindow): void;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  windowSize?: { width: number; height: number };
}

const DEFAULT_WINDOW_SIZE = { width: 280, height: 280 };
const SCREEN_MARGIN_PX = 24;

function clampAxis(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function clampDesktopPetBounds(
  bounds: DesktopPetBounds,
  workArea: DesktopPetBounds,
): DesktopPetBounds {
  return {
    x: clampAxis(bounds.x, workArea.x, workArea.x + workArea.width - bounds.width),
    y: clampAxis(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height),
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * 独立桌面宠物窗口控制器。窗口常驻，与主窗口可见性无关；
 * 主窗口最小化、隐藏到托盘或被关闭后背景运行时，宠物仍持续汇报状态。
 */
export function createDesktopPetWindowController(
  options: DesktopPetWindowControllerOptions,
): DesktopPetWindowController {
  const size = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  let window: DesktopPetWindow | null = null;
  let windowReady = false;
  let pet: PetDesktopPet | null = null;
  let status: PetDesktopStatus | null = null;
  let dragOffset: { x: number; y: number } | null = null;
  let topmostTimer: ReturnType<typeof setInterval> | null = null;

  function startTopmostGuard(): void {
    if (topmostTimer) return;
    // Windows 在移动/缩放透明置顶窗口后会丢掉 WS_EX_TOPMOST；低频重申保证宠物始终可见。
    topmostTimer = setInterval(() => {
      if (window && !window.isDestroyed() && window.isVisible()) {
        window.setAlwaysOnTop(true, "floating");
      }
    }, 2000);
    topmostTimer.unref?.();
  }

  function stopTopmostGuard(): void {
    if (!topmostTimer) return;
    clearInterval(topmostTimer);
    topmostTimer = null;
  }

  function isActive(): boolean {
    return Boolean(pet && status?.enabled && status.desktopEnabled);
  }

  function resolveDefaultBounds(): DesktopPetBounds {
    const workArea = options.getPrimaryWorkArea();
    return clampDesktopPetBounds(
      {
        x: workArea.x + workArea.width - size.width - SCREEN_MARGIN_PX,
        y: workArea.y + workArea.height - size.height - SCREEN_MARGIN_PX,
        ...size,
      },
      workArea,
    );
  }

  function resolveInitialBounds(): DesktopPetBounds {
    const saved = options.loadPosition();
    if (!saved) return resolveDefaultBounds();
    const bounds = { x: saved.x, y: saved.y, ...size };
    return clampDesktopPetBounds(bounds, options.getWorkAreaForBounds(bounds));
  }

  function sendPet(target: DesktopPetWindow): void {
    if (target.isDestroyed()) return;
    target.send(PlatformChannels.PetDesktopSnapshotPet, pet);
  }

  function sendStatus(target: DesktopPetWindow): void {
    if (target.isDestroyed()) return;
    target.send(PlatformChannels.PetDesktopSnapshotStatus, status);
  }

  function ensureWindow(): DesktopPetWindow {
    if (window && !window.isDestroyed()) return window;
    const created = options.createWindow(resolveInitialBounds());
    window = created;
    windowReady = false;
    created.onceReadyToShow(() => {
      if (window !== created || created.isDestroyed()) return;
      windowReady = true;
      // 窗口加载完成后再补一次快照，避免创建期间的更新早于页面订阅而丢失。
      sendPet(created);
      sendStatus(created);
      if (isActive()) {
        created.showInactive();
        startTopmostGuard();
        // Windows 启动阶段主窗口的 show/focus 会重排 z-order，首次显示可能丢掉置顶；
        // 等主窗口稳定后再申一次，之后由顶置守卫维持。
        const timer = setTimeout(() => {
          if (window === created && !created.isDestroyed() && isActive()) {
            created.setAlwaysOnTop(true, "floating");
            created.showInactive();
          }
        }, 500);
        timer.unref?.();
      }
    });
    created.on("closed", () => {
      if (window === created) {
        window = null;
        windowReady = false;
      }
    });
    options.logger.info("[desktop-pet] window created");
    return created;
  }

  function hideWindow(): void {
    if (window && !window.isDestroyed() && window.isVisible()) {
      window.hide();
      options.logger.info("[desktop-pet] window hidden");
    }
    stopTopmostGuard();
  }

  function syncVisibility(): void {
    if (!isActive()) {
      hideWindow();
      return;
    }
    const target = ensureWindow();
    if (windowReady && !target.isDestroyed()) {
      startTopmostGuard();
      if (!target.isVisible()) {
        target.showInactive();
        options.logger.info("[desktop-pet] window shown");
      }
    }
  }

  function activateMainWindow(taskId?: string): void {
    void Promise.resolve(options.ensureMainWindow(taskId)).catch((error: unknown) => {
      options.logger.warn(
        "[desktop-pet] failed to activate main window",
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  return {
    updatePet(nextPet) {
      pet = nextPet;
      if (window && !window.isDestroyed()) sendPet(window);
      syncVisibility();
    },

    updateStatus(nextStatus) {
      status = nextStatus;
      if (window && !window.isDestroyed()) sendStatus(window);
      syncVisibility();
    },

    resetPosition() {
      const bounds = resolveDefaultBounds();
      options.savePosition({ x: bounds.x, y: bounds.y });
      if (!window || window.isDestroyed()) return;
      window.setBounds(bounds);
    },

    resize(width, height) {
      if (!window || window.isDestroyed()) return;
      const nextWidth = Math.min(520, Math.max(80, Math.round(width)));
      const nextHeight = Math.min(520, Math.max(80, Math.round(height)));
      const bounds = window.getBounds();
      if (bounds.width === nextWidth && bounds.height === nextHeight) return;
      // 窗口按内容从右下向上/向左生长，宠物在屏幕上的位置保持不变。
      const right = bounds.x + bounds.width;
      const bottom = bounds.y + bounds.height;
      const clamped = clampDesktopPetBounds(
        {
          x: right - nextWidth,
          y: bottom - nextHeight,
          width: nextWidth,
          height: nextHeight,
        },
        options.getWorkAreaForBounds({ x: right, y: bottom, width: 1, height: 1 }),
      );
      window.setBounds(clamped);
    },

    handleDrag(phase) {
      if (phase === "start") {
        if (!window || window.isDestroyed()) return;
        const bounds = window.getBounds();
        const cursor = options.getCursorPoint();
        dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
        return;
      }
      if (phase === "move") {
        if (!dragOffset || !window || window.isDestroyed()) return;
        const cursor = options.getCursorPoint();
        window.setPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y);
        return;
      }
      if (!dragOffset) return;
      dragOffset = null;
      if (!window || window.isDestroyed()) return;
      const bounds = window.getBounds();
      const clamped = clampDesktopPetBounds(bounds, options.getWorkAreaForBounds(bounds));
      if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
        window.setBounds(clamped);
      }
      options.savePosition({ x: clamped.x, y: clamped.y });
    },

    activateMain() {
      activateMainWindow();
    },

    activateTask(taskId) {
      activateMainWindow(taskId);
    },

    showContextMenu() {
      if (!window || window.isDestroyed()) return;
      options.showContextMenu(window);
    },

    getSnapshot() {
      return { pet, status };
    },

    isPetWindowSender(webContentsId) {
      return Boolean(
        window && !window.isDestroyed() && window.getWebContentsId() === webContentsId,
      );
    },

    shouldKeepAppRunning() {
      return isActive();
    },

    dispose() {
      stopTopmostGuard();
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
      windowReady = false;
      dragOffset = null;
    },
  };
}

const MAX_SPRITESHEET_URL_LENGTH = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4096;
export const MAX_TASK_ID_LENGTH = 128;
const MAX_TASK_TITLE_LENGTH = 200;
const MAX_TASK_DETAIL_LENGTH = 400;
const MAX_ANIMATIONS = 64;
const MAX_FRAMES_PER_ANIMATION = 512;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFrameSpec(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isPositiveInteger(value.width) &&
    isPositiveInteger(value.height) &&
    isPositiveInteger(value.columns) &&
    isPositiveInteger(value.rows)
  );
}

function isAnimation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.frames) || value.frames.length === 0) return false;
  if (value.frames.length > MAX_FRAMES_PER_ANIMATION) return false;
  for (const frame of value.frames) {
    if (!isRecord(frame)) return false;
    if (
      typeof frame.spriteIndex !== "number" ||
      !Number.isInteger(frame.spriteIndex) ||
      frame.spriteIndex < 0
    ) {
      return false;
    }
    if (
      typeof frame.durationMs !== "number" ||
      !Number.isFinite(frame.durationMs) ||
      frame.durationMs <= 0
    ) {
      return false;
    }
  }
  if (value.loopStart !== null && !Number.isInteger(value.loopStart)) return false;
  return typeof value.fallback === "string" && value.fallback.length <= 256;
}

export function isPetDesktopPet(value: unknown): value is PetDesktopPet {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !value.id || value.id.length > 1024) return false;
  if (
    typeof value.displayName !== "string" ||
    !value.displayName ||
    value.displayName.length > MAX_TEXT_LENGTH
  ) {
    return false;
  }
  if (
    typeof value.spritesheetUrl !== "string" ||
    !value.spritesheetUrl ||
    value.spritesheetUrl.length > MAX_SPRITESHEET_URL_LENGTH
  ) {
    return false;
  }
  if (!isFrameSpec(value.frame)) return false;
  if (
    typeof value.frameCount !== "number" ||
    !Number.isInteger(value.frameCount) ||
    value.frameCount <= 0 ||
    value.frameCount > 256
  ) {
    return false;
  }
  if (!isRecord(value.animations)) return false;
  const entries = Object.entries(value.animations);
  if (entries.length === 0 || entries.length > MAX_ANIMATIONS) return false;
  return entries.every(([, animation]) => isAnimation(animation));
}

export function isPetDesktopStatus(value: unknown): value is PetDesktopStatus {
  if (!isRecord(value)) return false;
  if (
    typeof value.enabled !== "boolean" ||
    typeof value.desktopEnabled !== "boolean" ||
    typeof value.animationsEnabled !== "boolean"
  ) {
    return false;
  }
  if (
    typeof value.petSizePx !== "number" ||
    !Number.isFinite(value.petSizePx) ||
    value.petSizePx < 48 ||
    value.petSizePx > 320
  ) {
    return false;
  }
  if (value.theme !== "light" && value.theme !== "dark") return false;
  if (!isRecord(value.labels)) return false;
  for (const label of [value.labels.collapseTasks, value.labels.expandTasks]) {
    if (typeof label !== "string" || label.length === 0 || label.length > MAX_TASK_TITLE_LENGTH) {
      return false;
    }
  }
  if (!Array.isArray(value.tasks) || value.tasks.length > PET_DESKTOP_MAX_TASKS) return false;
  for (const task of value.tasks) {
    if (!isRecord(task)) return false;
    if (
      typeof task.taskId !== "string" ||
      task.taskId.length === 0 ||
      task.taskId.length > MAX_TASK_ID_LENGTH
    ) {
      return false;
    }
    if (
      task.kind !== "running" &&
      task.kind !== "waiting" &&
      task.kind !== "review" &&
      task.kind !== "failed"
    ) {
      return false;
    }
    if (
      typeof task.title !== "string" ||
      task.title.length === 0 ||
      task.title.length > MAX_TASK_TITLE_LENGTH
    ) {
      return false;
    }
    if (typeof task.detail !== "string" || task.detail.length > MAX_TASK_DETAIL_LENGTH) {
      return false;
    }
    if (!isFiniteNumber(task.expiresAt)) return false;
  }
  return true;
}
