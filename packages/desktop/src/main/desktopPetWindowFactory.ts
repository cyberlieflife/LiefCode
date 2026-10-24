import { app, BrowserWindow, Menu } from "electron";
import type { DesktopPetBounds, DesktopPetWindow } from "./desktopPetWindow.js";

/**
 * 真实桌面宠物窗口。透明、无边框、始终置顶、不进入任务栏；
 * 位置由控制器通过 IPC 调整，因此这里不开启系统原生拖动区域。
 */
export function createRealDesktopPetWindow(options: {
  bounds: DesktopPetBounds;
  preloadPath: string;
  rendererDir: string;
  rendererDevUrl?: string;
  getMenuLabels: () => { open: string; quit: string };
  onOpen: () => void;
  onQuit: () => void;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
}): DesktopPetWindow {
  const win = new BrowserWindow({
    ...options.bounds,
    // 不获取焦点：拖动/点击宠物时不会激活 LiefCode，也不会在 Dock/Alt+Tab 出现图标。
    // Windows 用 tool window 进一步排除任务栏/第三方 Dock 的窗口枚举。
    ...(process.platform === "darwin"
      ? { type: "panel" as const }
      : process.platform === "win32"
        ? { type: "toolbar" as const }
        : {}),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    focusable: false,
    // 主窗口可能最大化并覆盖整屏；置顶必须在创建时就生效，不能只依赖 show 之后的调用。
    alwaysOnTop: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setSkipTaskbar(true);
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  if (!app.isPackaged && options.rendererDevUrl) {
    void win.loadURL(`${options.rendererDevUrl}/pet-window.html`).catch((error: unknown) => {
      options.logger.warn("[desktop-pet] failed to load pet window (dev)", error);
    });
  } else {
    void win
      .loadFile(`${options.rendererDir}/pet-window.html`)
      .catch((error: unknown) => options.logger.warn("[desktop-pet] failed to load pet window", error));
  }

  let ready = false;
  const fireReady = (callback: () => void) => {
    if (ready) return;
    ready = true;
    callback();
  };

  return {
    isDestroyed: () => win.isDestroyed(),
    isVisible: () => !win.isDestroyed() && win.isVisible(),
    showInactive() {
      if (win.isDestroyed()) return;
      win.setAlwaysOnTop(true, "floating");
      win.showInactive();
      // Windows 上主窗口激活或最大化时可能把普通置顶窗口压下去；显示后再次抬升。
      win.setAlwaysOnTop(true, "floating");
      win.moveTop();
    },
    hide() {
      if (!win.isDestroyed()) win.hide();
    },
    destroy() {
      if (!win.isDestroyed()) win.destroy();
    },
    setPosition(x, y) {
      if (!win.isDestroyed()) {
        win.setPosition(Math.round(x), Math.round(y));
        // 移动透明置顶窗口后 Windows 可能丢掉 topmost，每次移动后补申。
        win.setAlwaysOnTop(true, "floating");
      }
    },
    getBounds() {
      const bounds = win.getBounds();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    },
    setBounds(bounds) {
      if (!win.isDestroyed()) {
        win.setBounds({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: bounds.width,
          height: bounds.height,
        });
        win.setAlwaysOnTop(true, "floating");
      }
    },
    setAlwaysOnTop(flag, level) {
      if (!win.isDestroyed()) win.setAlwaysOnTop(flag, level);
    },
    send(channel, payload) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    },
    onceReadyToShow(callback) {
      const fire = () => fireReady(callback);
      win.once("ready-to-show", fire);
      win.webContents.once("did-finish-load", fire);
    },
    on(event, callback) {
      if (event === "closed") win.on("closed", callback);
    },
    getWebContentsId: () => win.webContents.id,
    popupMenu() {
      if (win.isDestroyed()) return;
      const labels = options.getMenuLabels();
      const menu = Menu.buildFromTemplate([
        { label: labels.open, click: () => options.onOpen() },
        { type: "separator" },
        { label: labels.quit, click: () => options.onQuit() },
      ]);
      menu.popup({ window: win });
    },
  };
}
