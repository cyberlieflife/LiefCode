import { ipcMain } from "electron";
import { PlatformChannels } from "@zcode/shared";
import {
  isPetDesktopPet,
  isPetDesktopStatus,
  MAX_TASK_ID_LENGTH,
  type DesktopPetWindowController,
} from "./desktopPetWindow.js";

/**
 * 桌面宠物 IPC。主窗口只能写宠物定义与状态；拖动、恢复主窗口与右键菜单
 * 只接受宠物窗口自己的 webContents，避免任意 renderer 控制置顶窗口。
 */
export function registerDesktopPetIpc(options: {
  controller: DesktopPetWindowController;
  logger: {
    warn: (...args: unknown[]) => void;
  };
}): void {
  const { controller, logger } = options;

  ipcMain.on(PlatformChannels.PetDesktopSetPet, (event, payload: unknown) => {
    if (controller.isPetWindowSender(event.sender.id)) return;
    if (payload !== null && !isPetDesktopPet(payload)) {
      logger.warn("[desktop-pet] ignored invalid pet payload");
      return;
    }
    controller.updatePet(payload);
  });

  ipcMain.on(PlatformChannels.PetDesktopSetStatus, (event, payload: unknown) => {
    if (controller.isPetWindowSender(event.sender.id)) return;
    if (!isPetDesktopStatus(payload)) {
      logger.warn("[desktop-pet] ignored invalid status payload");
      return;
    }
    controller.updateStatus(payload);
  });

  ipcMain.on(PlatformChannels.PetDesktopResetPosition, (event) => {
    if (controller.isPetWindowSender(event.sender.id)) return;
    controller.resetPosition();
  });

  ipcMain.on(PlatformChannels.PetDesktopDrag, (event, payload: unknown) => {
    if (!controller.isPetWindowSender(event.sender.id)) return;
    const phase =
      payload && typeof payload === "object"
        ? (payload as { phase?: unknown }).phase
        : payload;
    if (phase === "start" || phase === "move" || phase === "end") {
      controller.handleDrag(phase);
    }
  });

  ipcMain.on(PlatformChannels.PetDesktopActivateMain, (event) => {
    if (!controller.isPetWindowSender(event.sender.id)) return;
    controller.activateMain();
  });

  ipcMain.on(PlatformChannels.PetDesktopActivateTask, (event, payload: unknown) => {
    if (!controller.isPetWindowSender(event.sender.id)) return;
    const taskId =
      payload && typeof payload === "object" ? (payload as { taskId?: unknown }).taskId : null;
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > MAX_TASK_ID_LENGTH) {
      return;
    }
    controller.activateTask(taskId);
  });

  ipcMain.on(PlatformChannels.PetDesktopContextMenu, (event) => {
    if (!controller.isPetWindowSender(event.sender.id)) return;
    controller.showContextMenu();
  });

  ipcMain.on(PlatformChannels.PetDesktopResize, (event, payload: unknown) => {
    if (!controller.isPetWindowSender(event.sender.id)) return;
    if (!payload || typeof payload !== "object") return;
    const { width, height } = payload as { width?: unknown; height?: unknown };
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return;
    }
    controller.resize(width, height);
  });

  ipcMain.handle(PlatformChannels.PetDesktopGetSnapshot, (event) => {
    if (!controller.isPetWindowSender(event.sender.id)) return null;
    return controller.getSnapshot();
  });
}
