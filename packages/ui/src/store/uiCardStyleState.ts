/**
 * 卡片样式偏好的 store 切片。
 *
 * 与 uiFontFamilyState 同属 store 的子状态模块：store/index.ts 只做组合，
 * 卡片样式的持久化、DOM 应用与广播处理都收在这里，避免主 store 文件继续膨胀。
 */
import {
  applyUiCardStyle,
  loadUiCardStyle,
  normalizeUiCardStyle,
  writeUiCardStyle,
  type UiCardStyle,
  type UiCardStyleConfig,
  type UiCardStyleSurface,
} from "@/lib/uiCardStyle.js";
import type { UiCardStyleBroadcastField } from "@/store/stateBroadcastFields.js";

/** 卡片样式的状态与 setter；ZCodeState 直接 extends 这份切片。 */
export interface UiCardStyleSlice {
  /** 侧边栏区域的卡片样式 */
  uiCardStyleSidebar: UiCardStyle;
  /** 大卡片（默认尺寸 Card）区域的卡片样式 */
  uiCardStyleCardLarge: UiCardStyle;
  /** 小卡片（data-size="sm"）区域的卡片样式 */
  uiCardStyleCardSmall: UiCardStyle;
  /** 面板（bg-panel 表面）区域的卡片样式 */
  uiCardStylePanel: UiCardStyle;
  /** 背景（窗口底与页面底）区域的卡片样式 */
  uiCardStyleBackground: UiCardStyle;
  setUiCardStyleSidebar: (style: UiCardStyle) => void;
  setUiCardStyleCardLarge: (style: UiCardStyle) => void;
  setUiCardStyleCardSmall: (style: UiCardStyle) => void;
  setUiCardStylePanel: (style: UiCardStyle) => void;
  setUiCardStyleBackground: (style: UiCardStyle) => void;
}

type UiCardStyleStateKey =
  | "uiCardStyleSidebar"
  | "uiCardStyleCardLarge"
  | "uiCardStyleCardSmall"
  | "uiCardStylePanel"
  | "uiCardStyleBackground";

const SURFACE_STATE_KEY: Record<UiCardStyleSurface, UiCardStyleStateKey> = {
  sidebar: "uiCardStyleSidebar",
  cardLarge: "uiCardStyleCardLarge",
  cardSmall: "uiCardStyleCardSmall",
  panel: "uiCardStylePanel",
  background: "uiCardStyleBackground",
};

function readConfig(state: UiCardStyleSlice): UiCardStyleConfig {
  return {
    sidebar: state.uiCardStyleSidebar,
    cardLarge: state.uiCardStyleCardLarge,
    cardSmall: state.uiCardStyleCardSmall,
    panel: state.uiCardStylePanel,
    background: state.uiCardStyleBackground,
  };
}

export function createUiCardStyleStoreSlice(params: {
  readState: () => UiCardStyleSlice;
  writeState: (patch: Partial<UiCardStyleSlice>) => void;
}): UiCardStyleSlice {
  const { readState, writeState } = params;
  const initial = loadUiCardStyle();
  // 创建即应用已持久化的偏好，主窗口与独立窗口都无需再单独调用一次。
  applyUiCardStyle(initial);

  // localStorage 只存一份五字段 JSON；store 侧按区域拆成独立标量字段，
  // 这样跨窗口广播能沿用"字段值比较"的既有机制，逐区域同步。
  const setSurface = (surface: UiCardStyleSurface, style: UiCardStyle): void => {
    const normalized = normalizeUiCardStyle(style);
    const config = { ...readConfig(readState()), [surface]: normalized };
    writeUiCardStyle(config);
    // 先落 DOM 再写 store：写 store 会触发跨窗口广播，本窗口回声由接收端 applyingBroadcast 屏蔽。
    applyUiCardStyle(config);
    writeState({ [SURFACE_STATE_KEY[surface]]: normalized } as Partial<UiCardStyleSlice>);
  };

  return {
    uiCardStyleSidebar: initial.sidebar,
    uiCardStyleCardLarge: initial.cardLarge,
    uiCardStyleCardSmall: initial.cardSmall,
    uiCardStylePanel: initial.panel,
    uiCardStyleBackground: initial.background,
    setUiCardStyleSidebar: (style) => {
      setSurface("sidebar", style);
    },
    setUiCardStyleCardLarge: (style) => {
      setSurface("cardLarge", style);
    },
    setUiCardStyleCardSmall: (style) => {
      setSurface("cardSmall", style);
    },
    setUiCardStylePanel: (style) => {
      setSurface("panel", style);
    },
    setUiCardStyleBackground: (style) => {
      setSurface("background", style);
    },
  };
}

type UiCardStyleSetterKeys =
  | "setUiCardStyleSidebar"
  | "setUiCardStyleCardLarge"
  | "setUiCardStyleCardSmall"
  | "setUiCardStylePanel"
  | "setUiCardStyleBackground";

export function applyUiCardStyleBroadcast(
  state: Pick<UiCardStyleSlice, UiCardStyleSetterKeys>,
  field: UiCardStyleBroadcastField,
  payload: unknown,
): void {
  const normalized = normalizeUiCardStyle(payload);
  if (field === "uiCardStyleSidebar") {
    state.setUiCardStyleSidebar(normalized);
  } else if (field === "uiCardStyleCardLarge") {
    state.setUiCardStyleCardLarge(normalized);
  } else if (field === "uiCardStyleCardSmall") {
    state.setUiCardStyleCardSmall(normalized);
  } else if (field === "uiCardStylePanel") {
    state.setUiCardStylePanel(normalized);
  } else {
    state.setUiCardStyleBackground(normalized);
  }
}
