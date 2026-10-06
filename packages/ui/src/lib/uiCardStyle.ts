/**
 * 卡片样式偏好：侧边栏、大卡片、小卡片、面板、背景各选一个样式，
 * 以 data-card-style-<surface> 属性挂在 <html> 上，由 styles.css 的卡片样式层消费。
 */
import { readSafeLocalStorage, writeSafeLocalStorage } from "@/lib/browserEnvironment.js";

export type UiCardStyle = "default" | "flat" | "acrylic" | "glass" | "liquid" | "neon";
export type UiCardStyleSurface = "sidebar" | "cardLarge" | "cardSmall" | "panel" | "background";

export type UiCardStyleConfig = Record<UiCardStyleSurface, UiCardStyle>;

export const UI_CARD_STYLE_STORAGE_KEY = "zcode-ui-card-style";

const DEFAULT_UI_CARD_STYLE: UiCardStyle = "default";

export const UI_CARD_STYLE_OPTION_ORDER: readonly UiCardStyle[] = [
  "default",
  "flat",
  "acrylic",
  "glass",
  "liquid",
  "neon",
];

export const UI_CARD_STYLE_SURFACES: readonly UiCardStyleSurface[] = [
  "sidebar",
  "cardLarge",
  "cardSmall",
  "panel",
  "background",
];

const DEFAULT_UI_CARD_STYLE_CONFIG: UiCardStyleConfig = {
  sidebar: "default",
  cardLarge: "default",
  cardSmall: "default",
  panel: "default",
  background: "default",
};

export function normalizeUiCardStyle(value: unknown): UiCardStyle {
  return UI_CARD_STYLE_OPTION_ORDER.includes(value as UiCardStyle)
    ? (value as UiCardStyle)
    : DEFAULT_UI_CARD_STYLE;
}

export function loadUiCardStyle(): UiCardStyleConfig {
  const config = { ...DEFAULT_UI_CARD_STYLE_CONFIG };
  const raw = readSafeLocalStorage(UI_CARD_STYLE_STORAGE_KEY);
  if (!raw) {
    return config;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return config;
    }
    const record = parsed as Record<string, unknown>;
    for (const surface of UI_CARD_STYLE_SURFACES) {
      config[surface] = normalizeUiCardStyle(record[surface]);
    }
    return config;
  } catch {
    return config;
  }
}

function cardStyleAttributeName(surface: UiCardStyleSurface): string {
  // HTML 属性名全小写，把驼峰 surface 映射成 kebab-case（cardLarge -> card-large）。
  return `data-card-style-${surface.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
}

export function applyUiCardStyle(config: UiCardStyleConfig): void {
  const root = typeof document === "undefined" ? undefined : document.documentElement;
  if (!root?.setAttribute) {
    return;
  }
  // 每次全量重写五个属性：default 也是合法值，切回默认时靠它清掉旧样式的选择器命中。
  for (const surface of UI_CARD_STYLE_SURFACES) {
    root.setAttribute(cardStyleAttributeName(surface), normalizeUiCardStyle(config[surface]));
  }
}

export function writeUiCardStyle(config: UiCardStyleConfig): void {
  writeSafeLocalStorage(UI_CARD_STYLE_STORAGE_KEY, JSON.stringify(config));
}

export function subscribeToUiCardStyleStorageChanges(): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== UI_CARD_STYLE_STORAGE_KEY) {
      return;
    }
    applyUiCardStyle(loadUiCardStyle());
  };

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
