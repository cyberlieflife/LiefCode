import { describe, expect, it, vi } from "vitest";
import type { PetDesktopPet, PetDesktopStatus } from "@zcode/shared";
import { PlatformChannels } from "@zcode/shared";

import {
  createDesktopPetWindowController,
  isPetDesktopPet,
  isPetDesktopStatus,
  type DesktopPetBounds,
  type DesktopPetWindow,
} from "../src/main/desktopPetWindow.js";

const WORK_AREA: DesktopPetBounds = { x: 0, y: 0, width: 1920, height: 1080 };

function createPet(): PetDesktopPet {
  return {
    id: "codex",
    displayName: "Codex",
    spritesheetUrl: "https://example.com/spritesheet.webp",
    frame: { width: 192, height: 208, columns: 8, rows: 9 },
    frameCount: 72,
    animations: {
      idle: {
        frames: [{ spriteIndex: 0, durationMs: 100 }],
        loopStart: 0,
        fallback: "idle",
      },
    },
  };
}

function createStatus(patch: Partial<PetDesktopStatus> = {}): PetDesktopStatus {
  return {
    enabled: true,
    desktopEnabled: true,
    animationsEnabled: true,
    theme: "dark",
    petSizePx: 160,
    labels: { collapseTasks: "Collapse task cards", expandTasks: "Expand task cards" },
    tasks: [],
    ...patch,
  };
}

class FakeDesktopPetWindow implements DesktopPetWindow {
  bounds: DesktopPetBounds;
  visible = false;
  destroyed = false;
  menuShown = false;
  positionCalls = 0;
  sent: Array<{ channel: string; payload: unknown }> = [];
  private readyCallback: (() => void) | null = null;
  private closedCallback: (() => void) | null = null;

  constructor(bounds: DesktopPetBounds) {
    this.bounds = bounds;
  }

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  showInactive() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  destroy() {
    this.destroyed = true;
    this.visible = false;
    this.closedCallback?.();
  }

  setPosition(x: number, y: number) {
    this.positionCalls += 1;
    this.bounds = { ...this.bounds, x, y };
  }

  getBounds() {
    return this.bounds;
  }

  setBounds(bounds: DesktopPetBounds) {
    this.bounds = bounds;
  }

  setAlwaysOnTop(_flag: boolean) {}

  send(channel: string, payload: unknown) {
    this.sent.push({ channel, payload });
  }

  onceReadyToShow(callback: () => void) {
    this.readyCallback = callback;
  }

  on(_event: "closed", callback: () => void) {
    this.closedCallback = callback;
  }

  getWebContentsId() {
    return 99;
  }

  popupMenu() {
    this.menuShown = true;
  }

  ready() {
    this.readyCallback?.();
  }
}

function flushDragMove(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createHarness() {
  let created: FakeDesktopPetWindow | null = null;
  let cursor = { x: 0, y: 0 };
  let savedPosition: { x: number; y: number } | null = null;
  const saved = vi.fn((position: { x: number; y: number }) => {
    savedPosition = position;
  });
  const ensureMainWindow = vi.fn();
  const logger = { info: vi.fn(), warn: vi.fn() };

  const controller = createDesktopPetWindowController({
    createWindow: (bounds) => {
      created = new FakeDesktopPetWindow(bounds);
      return created;
    },
    getCursorPoint: () => cursor,
    getPrimaryWorkArea: () => WORK_AREA,
    getWorkAreaForBounds: () => WORK_AREA,
    loadPosition: () => savedPosition,
    savePosition: saved,
    ensureMainWindow,
    showContextMenu: (window) => window.popupMenu?.(),
    logger,
    windowSize: { width: 280, height: 280 },
  });

  return {
    controller,
    saved,
    ensureMainWindow,
    getWindow: () => created,
    setCursor: (point: { x: number; y: number }) => {
      cursor = point;
    },
    setSavedPosition: (position: { x: number; y: number } | null) => {
      savedPosition = position;
    },
  };
}

describe("desktop pet window controller", () => {
  it("creates, snapshots and shows the window only when a pet is enabled", () => {
    const harness = createHarness();
    const pet = createPet();

    harness.controller.updatePet(pet);
    harness.controller.updateStatus(createStatus());
    const window = harness.getWindow();
    expect(window).not.toBeNull();
    if (!window) return;
    expect(window.getBounds()).toEqual({ x: 1616, y: 776, width: 280, height: 280 });

    expect(window.visible).toBe(false);
    window.ready();
    expect(window.visible).toBe(true);
    expect(
      window.sent.some(({ channel }) => channel === PlatformChannels.PetDesktopSnapshotPet),
    ).toBe(true);
    expect(
      window.sent.some(({ channel }) => channel === PlatformChannels.PetDesktopSnapshotStatus),
    ).toBe(true);
  });

  it("hides without destroying the window when the desktop pet is turned off", () => {
    const harness = createHarness();
    harness.controller.updatePet(createPet());
    harness.controller.updateStatus(createStatus());
    const window = harness.getWindow();
    window?.ready();
    expect(window?.visible).toBe(true);

    harness.controller.updateStatus(createStatus({ desktopEnabled: false }));
    expect(window?.visible).toBe(false);
    expect(window?.destroyed).toBe(false);
    expect(harness.controller.shouldKeepAppRunning()).toBe(false);

    harness.controller.updateStatus(createStatus());
    expect(window?.visible).toBe(true);
    expect(harness.controller.shouldKeepAppRunning()).toBe(true);
  });

  it("drags through the cursor offset and clamps to the work area on release", async () => {
    const harness = createHarness();
    harness.controller.updatePet(createPet());
    harness.controller.updateStatus(createStatus());
    const window = harness.getWindow();
    window?.ready();
    if (!window) return;

    harness.setCursor({ x: 1700, y: 820 });
    harness.controller.handleDrag("start");
    harness.setCursor({ x: 1500, y: 420 });
    harness.controller.handleDrag("move");
    await flushDragMove();
    expect(window.getBounds().x).toBe(1416);
    expect(window.getBounds().y).toBe(376);

    // 拖出屏幕后松手：窗口整体回到工作区内，并持久化最终位置。
    harness.setCursor({ x: 10, y: 10 });
    harness.controller.handleDrag("move");
    harness.controller.handleDrag("end");
    expect(window.getBounds().x).toBe(0);
    expect(window.getBounds().y).toBe(0);
    expect(harness.saved).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it("coalesces queued drag moves and lands on the release cursor", async () => {
    const harness = createHarness();
    harness.controller.updatePet(createPet());
    harness.controller.updateStatus(createStatus());
    const window = harness.getWindow();
    window?.ready();
    if (!window) return;

    harness.setCursor({ x: 1700, y: 820 });
    harness.controller.handleDrag("start");
    harness.setCursor({ x: 1600, y: 700 });
    harness.controller.handleDrag("move");
    harness.setCursor({ x: 1500, y: 600 });
    harness.controller.handleDrag("move");
    // 同一轮事件循环内的多次移动只落一次原生定位。
    expect(window.positionCalls).toBe(0);
    await flushDragMove();
    expect(window.positionCalls).toBe(1);
    expect(window.getBounds()).toMatchObject({ x: 1416, y: 556 });

    // 最后一帧没有送达时，松手仍以当前光标位置校正。
    harness.setCursor({ x: 1300, y: 500 });
    harness.controller.handleDrag("move");
    harness.controller.handleDrag("end");
    expect(window.getBounds()).toMatchObject({ x: 1216, y: 456 });
    expect(window.positionCalls).toBe(2);
  });

  it("resizes around the bottom-right anchor", () => {
    const harness = createHarness();
    harness.controller.updatePet(createPet());
    harness.controller.updateStatus(createStatus());
    const window = harness.getWindow();
    window?.ready();
    if (!window) return;
    const before = window.getBounds();

    harness.controller.resize(200, 220);

    expect(window.getBounds()).toEqual({
      x: before.x + before.width - 200,
      y: before.y + before.height - 220,
      width: 200,
      height: 220,
    });
  });

  it("resets the position to the bottom-right corner", () => {    const harness = createHarness();
    harness.controller.updatePet(createPet());
    harness.controller.updateStatus(createStatus());
    const window = harness.getWindow();
    window?.ready();
    if (!window) return;

    window.setBounds({ x: 20, y: 30, width: 280, height: 280 });
    harness.controller.resetPosition();

    expect(window.getBounds()).toEqual({ x: 1616, y: 776, width: 280, height: 280 });
    expect(harness.saved).toHaveBeenCalledWith({ x: 1616, y: 776 });
  });

  it("uses the saved position on first creation and clamps it into the display", () => {
    const harness = createHarness();
    harness.setSavedPosition({ x: 5000, y: 5000 });
    harness.controller.updatePet(createPet());
    harness.controller.updateStatus(createStatus());

    expect(harness.getWindow()?.getBounds()).toEqual({
      x: 1640,
      y: 800,
      width: 280,
      height: 280,
    });
  });

  it("activates the main window, forwards the menu and validates senders", () => {
    const harness = createHarness();
    harness.controller.updatePet(createPet());
    harness.controller.updateStatus(createStatus());
    const window = harness.getWindow();
    window?.ready();

    harness.controller.activateMain();
    expect(harness.ensureMainWindow).toHaveBeenCalledTimes(1);

    harness.controller.activateTask("session-42");
    expect(harness.ensureMainWindow).toHaveBeenLastCalledWith("session-42");

    harness.controller.showContextMenu();
    expect(window?.menuShown).toBe(true);

    expect(harness.controller.isPetWindowSender(99)).toBe(true);
    expect(harness.controller.isPetWindowSender(1)).toBe(false);

    harness.controller.updatePet(null);
    expect(harness.controller.getSnapshot().pet).toBeNull();
    expect(window?.visible).toBe(false);
  });
});

describe("desktop pet payload validation", () => {
  it("accepts valid pet and status payloads", () => {
    expect(isPetDesktopPet(createPet())).toBe(true);
    expect(isPetDesktopStatus(createStatus())).toBe(true);
    expect(
      isPetDesktopStatus(
        createStatus({
          tasks: [
            {
              taskId: "session-1",
              kind: "review",
              title: "New task",
              detail: "Done",
              expiresAt: 2,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isPetDesktopPet(null)).toBe(false);
    expect(isPetDesktopPet({ ...createPet(), frameCount: 0 })).toBe(false);
    expect(isPetDesktopPet({ ...createPet(), animations: {} })).toBe(false);
    expect(
      isPetDesktopPet({
        ...createPet(),
        animations: { idle: { frames: [], loopStart: 0, fallback: "idle" } },
      }),
    ).toBe(false);
    expect(isPetDesktopStatus({ ...createStatus(), theme: "sepia" })).toBe(false);
    expect(isPetDesktopStatus({ ...createStatus(), petSizePx: 999 })).toBe(false);
    expect(
      isPetDesktopStatus({
        ...createStatus(),
        labels: { collapseTasks: "", expandTasks: "Expand task cards" },
      }),
    ).toBe(false);
    expect(
      isPetDesktopStatus({
        ...createStatus(),
        tasks: [
          {
            taskId: "session-1",
            kind: "unknown",
            title: "New task",
            detail: "x",
            expiresAt: 2,
          },
        ],
      }),
    ).toBe(false);
    expect(
      isPetDesktopStatus({
        ...createStatus(),
        tasks: [
          { taskId: "a", kind: "running", title: "A", detail: "x", expiresAt: 1 },
          { taskId: "b", kind: "running", title: "B", detail: "x", expiresAt: 1 },
          { taskId: "c", kind: "running", title: "C", detail: "x", expiresAt: 1 },
          { taskId: "d", kind: "running", title: "D", detail: "x", expiresAt: 1 },
        ],
      }),
    ).toBe(false);
    expect(
      isPetDesktopStatus({
        ...createStatus(),
        tasks: [{ taskId: "a", kind: "running", title: "", detail: "x", expiresAt: 1 }],
      }),
    ).toBe(false);
    expect(
      isPetDesktopStatus({
        ...createStatus(),
        tasks: [
          { taskId: "a", kind: "running", title: "A", detail: "x", expiresAt: Number.NaN },
        ],
      }),
    ).toBe(false);
  });
});
