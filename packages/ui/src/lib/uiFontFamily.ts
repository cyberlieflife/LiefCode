/**
 * 界面字体偏好：英文与中文各选一个字体，分别写入 --ui-font-latin / --ui-font-cjk。
 */
import { readSafeLocalStorage } from "@/lib/browserEnvironment.js";

export type UiFontFamilyLatin =
  | "system"
  | "anthropic-serif"
  | "opendyslexic"
  | "inter"
  | "ibm-plex-sans"
  | "atkinson-hyperlegible"
  | "literata";
export type UiFontFamilyCjk =
  | "system"
  | "noto-serif-sc"
  | "microsoft-yahei"
  | "smiley-sans"
  | "lxgw-wenkai"
  | "noto-sans-sc";

export const UI_FONT_FAMILY_LATIN_STORAGE_KEY = "zcode-ui-font-latin";
export const UI_FONT_FAMILY_CJK_STORAGE_KEY = "zcode-ui-font-cjk";

const DEFAULT_UI_FONT_FAMILY_LATIN: UiFontFamilyLatin = "system";
const DEFAULT_UI_FONT_FAMILY_CJK: UiFontFamilyCjk = "system";

/**
 * 英文栈刻意不含 sans-serif 等通用族名：通用族名会先于中文栈匹配到汉字，
 * 让中文选择看起来"没生效"。
 */
const UI_FONT_LATIN_STACKS: Record<UiFontFamilyLatin, string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"',
  "anthropic-serif":
    '"Tiempos Headline", "Copernicus", "Iowan Old Style", "Palatino Linotype", "Source Serif Pro", Georgia, Cambria',
  opendyslexic: '"OpenDyslexic", ui-sans-serif, system-ui, -apple-system, "Segoe UI"',
  inter: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI"',
  "ibm-plex-sans": '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI"',
  "atkinson-hyperlegible":
    '"Atkinson Hyperlegible", ui-sans-serif, system-ui, -apple-system, "Segoe UI"',
  literata: '"Literata", "Iowan Old Style", "Palatino Linotype", Georgia, Cambria',
};

const UI_FONT_CJK_STACKS: Record<UiFontFamilyCjk, string> = {
  system:
    '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  "noto-serif-sc": '"Noto Serif SC", "Songti SC", "SimSun", serif',
  "microsoft-yahei": '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
  "smiley-sans": '"Smiley Sans Oblique", "PingFang SC", "Microsoft YaHei UI", sans-serif',
  "lxgw-wenkai": '"LXGW WenKai", "PingFang SC", "Microsoft YaHei UI", sans-serif',
  "noto-sans-sc": '"Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", sans-serif',
};

export const UI_FONT_LATIN_OPTION_ORDER: readonly UiFontFamilyLatin[] = [
  "system",
  "inter",
  "ibm-plex-sans",
  "anthropic-serif",
  "literata",
  "atkinson-hyperlegible",
  "opendyslexic",
];

export const UI_FONT_CJK_OPTION_ORDER: readonly UiFontFamilyCjk[] = [
  "system",
  "noto-sans-sc",
  "noto-serif-sc",
  "microsoft-yahei",
  "lxgw-wenkai",
  "smiley-sans",
];

export function getUiFontLatinStack(value: UiFontFamilyLatin): string {
  return UI_FONT_LATIN_STACKS[value];
}

export function getUiFontCjkStack(value: UiFontFamilyCjk): string {
  return UI_FONT_CJK_STACKS[value];
}

export function normalizeUiFontFamilyLatin(value: unknown): UiFontFamilyLatin {
  return UI_FONT_LATIN_OPTION_ORDER.includes(value as UiFontFamilyLatin)
    ? (value as UiFontFamilyLatin)
    : DEFAULT_UI_FONT_FAMILY_LATIN;
}

export function normalizeUiFontFamilyCjk(value: unknown): UiFontFamilyCjk {
  return UI_FONT_CJK_OPTION_ORDER.includes(value as UiFontFamilyCjk)
    ? (value as UiFontFamilyCjk)
    : DEFAULT_UI_FONT_FAMILY_CJK;
}

export function loadUiFontFamily(): { latin: UiFontFamilyLatin; cjk: UiFontFamilyCjk } {
  return {
    latin: normalizeUiFontFamilyLatin(readSafeLocalStorage(UI_FONT_FAMILY_LATIN_STORAGE_KEY)),
    cjk: normalizeUiFontFamilyCjk(readSafeLocalStorage(UI_FONT_FAMILY_CJK_STORAGE_KEY)),
  };
}

export function applyUiFontFamily(latin: UiFontFamilyLatin, cjk: UiFontFamilyCjk): void {
  const rootStyle = typeof document === "undefined" ? undefined : document.documentElement?.style;
  if (!rootStyle?.setProperty) {
    return;
  }
  // 只改字体族 Token；--font-mono（代码字体）与 --ui-font-size 不受界面字体选择影响。
  rootStyle.setProperty("--ui-font-latin", getUiFontLatinStack(normalizeUiFontFamilyLatin(latin)));
  rootStyle.setProperty("--ui-font-cjk", getUiFontCjkStack(normalizeUiFontFamilyCjk(cjk)));
}

export function subscribeToUiFontFamilyStorageChanges(): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== UI_FONT_FAMILY_LATIN_STORAGE_KEY &&
      event.key !== UI_FONT_FAMILY_CJK_STORAGE_KEY
    ) {
      return;
    }

    // 两个 key 都可能变化，统一按当前存储值重算，避免只更新变动的那一半。
    const current = loadUiFontFamily();
    applyUiFontFamily(current.latin, current.cjk);
  };

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
