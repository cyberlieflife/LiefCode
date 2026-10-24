import { PET_DEFAULT_PET_ID } from "./contract.js";

/**
 * 宠物偏好单独存储；与主题一样属于本机外观设置，不写入任务或工作区数据。
 * 桌面宠物的窗口位置由主进程单独持久化，这里只保存用户选择与开关。
 */
export const PET_ID_STORAGE_KEY = "zcode-pet-id";
export const PET_ANIMATIONS_STORAGE_KEY = "zcode-pet-animations";
export const PET_DESKTOP_ENABLED_STORAGE_KEY = "zcode-pet-desktop-enabled";
export const PET_SIZE_STORAGE_KEY = "zcode-pet-size-px";

export const PET_SIZE_MIN_PX = 96;
export const PET_SIZE_MAX_PX = 256;
export const PET_SIZE_DEFAULT_PX = 160;

function readStoredValue(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // 隐私模式或磁盘配额耗尽时保留内存态，不能阻断用户继续切换。
  }
}

export function normalizePetId(value: unknown): string {
  if (typeof value !== "string") return PET_DEFAULT_PET_ID;
  const trimmed = value.trim();
  return trimmed || PET_DEFAULT_PET_ID;
}

export function normalizePetAnimationsEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "false") return false;
  if (value === "true") return true;
  return true;
}

export function normalizePetDesktopEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "false") return false;
  if (value === "true") return true;
  return true;
}

export function normalizePetSizePx(value: unknown): number {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return PET_SIZE_DEFAULT_PX;
  return Math.min(PET_SIZE_MAX_PX, Math.max(PET_SIZE_MIN_PX, Math.round(numeric)));
}

/** 返回用户显式保存过的宠物 id；用于首次启动时接管 Codex 自定义宠物。 */
export function readStoredPetId(): string | null {
  const value = readStoredValue(PET_ID_STORAGE_KEY)?.trim();
  return value || null;
}

export interface PetSlice {
  petId: string;
  petAnimationsEnabled: boolean;
  /** 主窗口打开、最小化或仅在后台运行时都显示独立桌面宠物窗口。 */
  petDesktopEnabled: boolean;
  /** 桌面宠物精灵显示高度（px）。 */
  petSizePx: number;
  setPetId: (petId: string) => void;
  setPetAnimationsEnabled: (enabled: boolean) => void;
  setPetDesktopEnabled: (enabled: boolean) => void;
  setPetSizePx: (sizePx: number) => void;
}

export function createPetStoreSlice(params: {
  readState: () => PetSlice;
  writeState: (patch: Partial<PetSlice>) => void;
}): PetSlice {
  const { writeState } = params;
  return {
    petId: normalizePetId(readStoredValue(PET_ID_STORAGE_KEY)),
    petAnimationsEnabled: normalizePetAnimationsEnabled(
      readStoredValue(PET_ANIMATIONS_STORAGE_KEY),
    ),
    petDesktopEnabled: normalizePetDesktopEnabled(
      readStoredValue(PET_DESKTOP_ENABLED_STORAGE_KEY),
    ),
    petSizePx: normalizePetSizePx(readStoredValue(PET_SIZE_STORAGE_KEY)),
    setPetId: (petId) => {
      const normalized = normalizePetId(petId);
      writeStoredValue(PET_ID_STORAGE_KEY, normalized);
      writeState({ petId: normalized });
    },
    setPetAnimationsEnabled: (enabled) => {
      const normalized = normalizePetAnimationsEnabled(enabled);
      writeStoredValue(PET_ANIMATIONS_STORAGE_KEY, normalized ? "true" : "false");
      writeState({ petAnimationsEnabled: normalized });
    },
    setPetDesktopEnabled: (enabled) => {
      const normalized = normalizePetDesktopEnabled(enabled);
      writeStoredValue(PET_DESKTOP_ENABLED_STORAGE_KEY, normalized ? "true" : "false");
      writeState({ petDesktopEnabled: normalized });
    },
    setPetSizePx: (sizePx) => {
      const normalized = normalizePetSizePx(sizePx);
      writeStoredValue(PET_SIZE_STORAGE_KEY, String(normalized));
      writeState({ petSizePx: normalized });
    },
  };
}

type PetSetterKeys =
  | "setPetId"
  | "setPetAnimationsEnabled"
  | "setPetDesktopEnabled"
  | "setPetSizePx";

export function applyPetBroadcast(
  state: Pick<PetSlice, PetSetterKeys>,
  field: string,
  payload: unknown,
): void {
  if (field === "petId" && typeof payload === "string") {
    state.setPetId(payload);
  } else if (field === "petAnimationsEnabled" && typeof payload === "boolean") {
    state.setPetAnimationsEnabled(payload);
  } else if (field === "petDesktopEnabled" && typeof payload === "boolean") {
    state.setPetDesktopEnabled(payload);
  } else if (field === "petSizePx" && typeof payload === "number") {
    state.setPetSizePx(payload);
  }
}
