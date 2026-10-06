/**
 * 界面字体偏好的 store 切片。
 *
 * 与 codingPlanQuotaResetState 同属 store 的子状态模块：store/index.ts 只做组合，
 * 字体偏好的持久化、DOM 应用与广播处理都收在这里，避免主 store 文件继续膨胀。
 */
import { writeSafeLocalStorage } from "@/lib/browserEnvironment.js";
import {
  applyUiFontFamily,
  loadUiFontFamily,
  normalizeUiFontFamilyCjk,
  normalizeUiFontFamilyLatin,
  UI_FONT_FAMILY_CJK_STORAGE_KEY,
  UI_FONT_FAMILY_LATIN_STORAGE_KEY,
  type UiFontFamilyCjk,
  type UiFontFamilyLatin,
} from "@/lib/uiFontFamily.js";
import type { UiFontFamilyBroadcastField } from "@/store/stateBroadcastFields.js";

/** 字体偏好的状态与 setter；ZCodeState 直接 extends 这份切片。 */
export interface UiFontFamilySlice {
  /** 界面英文栈选择 */
  uiFontFamilyLatin: UiFontFamilyLatin;
  /** 界面中文栈选择 */
  uiFontFamilyCjk: UiFontFamilyCjk;
  setUiFontFamilyLatin: (family: UiFontFamilyLatin) => void;
  setUiFontFamilyCjk: (family: UiFontFamilyCjk) => void;
}

export function createUiFontFamilyStoreSlice(params: {
  readState: () => UiFontFamilySlice;
  writeState: (patch: Partial<UiFontFamilySlice>) => void;
}): UiFontFamilySlice {
  const { readState, writeState } = params;
  const initial = loadUiFontFamily();
  // 创建即应用已持久化的偏好，主窗口与独立窗口都无需再单独调用一次。
  applyUiFontFamily(initial.latin, initial.cjk);

  return {
    uiFontFamilyLatin: initial.latin,
    uiFontFamilyCjk: initial.cjk,
    setUiFontFamilyLatin: (family) => {
      const normalizedFamily = normalizeUiFontFamilyLatin(family);
      writeSafeLocalStorage(UI_FONT_FAMILY_LATIN_STORAGE_KEY, normalizedFamily);
      // 两个字体栈写在同一条 CSS 声明里，必须成对应用，否则切换英文会重置中文选择。
      applyUiFontFamily(normalizedFamily, readState().uiFontFamilyCjk);
      writeState({ uiFontFamilyLatin: normalizedFamily });
    },
    setUiFontFamilyCjk: (family) => {
      const normalizedFamily = normalizeUiFontFamilyCjk(family);
      writeSafeLocalStorage(UI_FONT_FAMILY_CJK_STORAGE_KEY, normalizedFamily);
      applyUiFontFamily(readState().uiFontFamilyLatin, normalizedFamily);
      writeState({ uiFontFamilyCjk: normalizedFamily });
    },
  };
}

/** 收到其他窗口广播的字体偏好时调用；走 setter 保证副作用与本地切换一致。 */
export function applyUiFontFamilyBroadcast(
  state: Pick<UiFontFamilySlice, "setUiFontFamilyLatin" | "setUiFontFamilyCjk">,
  field: UiFontFamilyBroadcastField,
  payload: unknown,
): void {
  if (field === "uiFontFamilyLatin") {
    state.setUiFontFamilyLatin(normalizeUiFontFamilyLatin(payload));
    return;
  }
  state.setUiFontFamilyCjk(normalizeUiFontFamilyCjk(payload));
}
