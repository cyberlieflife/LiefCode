import { contextBridge, ipcRenderer } from "electron";
import {
  PlatformChannels,
  type PetDesktopPet,
  type PetDesktopStatus,
} from "@zcode/shared";

export interface DesktopPetSnapshot {
  pet: PetDesktopPet | null;
  status: PetDesktopStatus | null;
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("zcodePet", {
  getSnapshot: (): Promise<DesktopPetSnapshot | null> =>
    ipcRenderer.invoke(PlatformChannels.PetDesktopGetSnapshot),
  onPet: (callback: (pet: PetDesktopPet | null) => void): (() => void) =>
    subscribe(PlatformChannels.PetDesktopSnapshotPet, callback),
  onStatus: (callback: (status: PetDesktopStatus) => void): (() => void) =>
    subscribe(PlatformChannels.PetDesktopSnapshotStatus, callback),
  dragStart: () => ipcRenderer.send(PlatformChannels.PetDesktopDrag, { phase: "start" }),
  dragMove: () => ipcRenderer.send(PlatformChannels.PetDesktopDrag, { phase: "move" }),
  dragEnd: () => ipcRenderer.send(PlatformChannels.PetDesktopDrag, { phase: "end" }),
  resize: (width: number, height: number) =>
    ipcRenderer.send(PlatformChannels.PetDesktopResize, { width, height }),
  activateMainWindow: () => ipcRenderer.send(PlatformChannels.PetDesktopActivateMain),
  activateTask: (taskId: string) =>
    ipcRenderer.send(PlatformChannels.PetDesktopActivateTask, { taskId }),
  showContextMenu: () => ipcRenderer.send(PlatformChannels.PetDesktopContextMenu),
});
