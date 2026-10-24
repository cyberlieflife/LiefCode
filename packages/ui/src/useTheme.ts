import { useEffect, useState, useCallback } from "react";

export type Theme =
  | "light"
  | "dark"
  | "zai-light"
  | "zai-dark"
  | "claude-light"
  | "claude-dark"
  | "codex-light"
  | "codex-dark"
  | "system";
export type ResolvedTheme = "light" | "dark";

/**
 * UI 方案（几何、阴影、排版）与配色方案分开存储。
 * default 保持既有几何；claude / codex 各自覆盖共享的圆角与阴影 token。
 */
export type StyleTheme = "default" | "claude" | "codex";

/** 配色方案存储键；UI 方案使用独立键，两者互不覆盖。 */
export const THEME_STORAGE_KEY = "zcode-theme";
export const STYLE_THEME_STORAGE_KEY = "zcode-style-theme";
const BROWSER_THEME_SURFACE_ATTRIBUTE = "data-zcode-browser-theme-surface";
/** 挂在 documentElement 上的配色类，取值与 Theme 的非 system 值一一对应。 */
const THEME_CLASS_NAMES = [
  "theme-zai-light",
  "theme-zai-dark",
  "theme-claude-light",
  "theme-claude-dark",
  "theme-codex-light",
  "theme-codex-dark",
] as const;
/** UI 方案类名始终收敛到一个，切换时不会残留上一个方案。 */
const STYLE_THEME_CLASS_NAMES = ["style-default", "style-claude", "style-codex"] as const;

const STYLE_THEME_VALUES: ReadonlySet<string> = new Set(["default", "claude", "codex"]);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function isClaudeTheme(theme: Theme): boolean {
  return theme === "claude-light" || theme === "claude-dark";
}

export function isCodexTheme(theme: Theme): boolean {
  return theme === "codex-light" || theme === "codex-dark";
}

export function isStyleTheme(value: string | null | undefined): value is StyleTheme {
  return typeof value === "string" && STYLE_THEME_VALUES.has(value);
}

/**
 * 显式 UI 方案优先；没有保存过 UI 方案时按历史行为迁移：
 * Claude 配色继续使用 Claude 方案，其余配色使用默认方案。
 */
export function resolveStyleTheme(theme: Theme, explicit?: StyleTheme | null): StyleTheme {
  if (isStyleTheme(explicit)) return explicit;
  return isClaudeTheme(normalizeThemePreference(theme)) ? "claude" : "default";
}

/** 不含 system 的主题直接映射明暗，供无 window 环境（如 SSR 兜底）复用。 */
export function resolveStaticTheme(theme: Exclude<Theme, "system">): ResolvedTheme {
  return theme === "dark" ||
    theme === "zai-dark" ||
    theme === "claude-dark" ||
    theme === "codex-dark"
    ? "dark"
    : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme();
  }

  return resolveStaticTheme(normalizeThemePreference(theme) as Exclude<Theme, "system">);
}

/** 把偏好（含 system）收敛成实际生效的主题值，用于选择配色类。 */
export function resolveAppliedTheme(theme: Theme): Exclude<Theme, "system"> {
  if (theme === "system") {
    return getSystemTheme() === "dark" ? "zai-dark" : "zai-light";
  }
  return normalizeThemePreference(theme) as Exclude<Theme, "system">;
}

export function normalizeThemePreference(theme: Theme): Theme {
  if (theme === "dark") return "zai-dark";
  if (theme === "light") return "zai-light";
  return theme;
}

/**
 * 只翻转明暗，保留当前配色家族与 UI 方案。
 * 旧实现直接写 light/dark，会被归一成 Zai，导致 Claude/Codex 配色丢失。
 */
export function toggleThemeMode(theme: Theme): Theme {
  const family = isClaudeTheme(theme) ? "claude" : isCodexTheme(theme) ? "codex" : "zai";
  const nextMode = resolveTheme(theme) === "dark" ? "light" : "dark";
  return `${family}-${nextMode}` as Theme;
}

/** 读取 UI 方案偏好；缺失或非法时按配色方案迁移。 */
export function readStyleThemePreference(theme: Theme): StyleTheme {
  if (typeof localStorage === "undefined") {
    return resolveStyleTheme(theme);
  }
  const saved = localStorage.getItem(STYLE_THEME_STORAGE_KEY);
  return isStyleTheme(saved) ? saved : resolveStyleTheme(theme);
}

function setThemeMetaContent(name: "theme-color" | "color-scheme", content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
}

function syncBrowserThemeSurface(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (
    typeof root.hasAttribute !== "function" ||
    !root.hasAttribute(BROWSER_THEME_SURFACE_ATTRIBUTE)
  ) {
    return;
  }

  // Electron 为 vibrancy 保持透明根背景，但普通浏览器需要从文档根和标准 meta
  // 获得页面主题。只切换 React 的 dark class 会让浏览器工具栏、原生控件和 overscroll 留在旧主题。
  root.setAttribute(BROWSER_THEME_SURFACE_ATTRIBUTE, resolved);
  root.style.colorScheme = resolved;
  setThemeMetaContent("color-scheme", resolved);

  const background = getComputedStyle(root).getPropertyValue("--color-background").trim();
  if (background) {
    setThemeMetaContent("theme-color", background);
  }
}

export function applyTheme(theme: Theme, styleTheme?: StyleTheme | null) {
  const normalizedTheme = normalizeThemePreference(theme);
  const resolved = resolveTheme(normalizedTheme);
  const appliedTheme = resolveAppliedTheme(normalizedTheme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // 配色类按 appliedTheme 逐一收敛，避免切换时残留上一个配色类的变量。
  for (const className of THEME_CLASS_NAMES) {
    document.documentElement.classList.toggle(className, `theme-${appliedTheme}` === className);
  }
  // UI 方案层独立切换：显式偏好优先，未提供时按配色方案迁移。
  const appliedStyleTheme = resolveStyleTheme(normalizedTheme, styleTheme);
  for (const className of STYLE_THEME_CLASS_NAMES) {
    document.documentElement.classList.toggle(className, `style-${appliedStyleTheme}` === className);
  }
  syncBrowserThemeSurface(resolved);
}

export function isTheme(value: string | null | undefined): value is Theme {
  return (
    value === "light" ||
    value === "dark" ||
    value === "zai-light" ||
    value === "zai-dark" ||
    value === "claude-light" ||
    value === "claude-dark" ||
    value === "codex-light" ||
    value === "codex-dark" ||
    value === "system"
  );
}

function readThemePreference(): Theme {
  const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(THEME_STORAGE_KEY);
  // 默认主题统一收敛到 Zai dark，避免旧 hook 兜底值和 Zustand store 默认值分叉。
  return isTheme(saved) ? normalizeThemePreference(saved) : "zai-dark";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readThemePreference);
  const [styleTheme, setStyleThemeState] = useState<StyleTheme>(() =>
    readStyleThemePreference(readThemePreference()),
  );

  const setTheme = useCallback((t: Theme) => {
    const normalizedTheme = normalizeThemePreference(t);
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    setThemeState(normalizedTheme);
    applyTheme(normalizedTheme, readStyleThemePreference(normalizedTheme));
  }, []);

  const setStyleTheme = useCallback((nextStyleTheme: StyleTheme) => {
    localStorage.setItem(STYLE_THEME_STORAGE_KEY, nextStyleTheme);
    setStyleThemeState(nextStyleTheme);
    // 从存储读取当前配色，避免闭包中的 theme 在连续调用时变成旧值。
    applyTheme(readThemePreference(), nextStyleTheme);
  }, []);

  // 初始化 + system 模式下监听系统偏好变化；配色与 UI 方案任一变化都重新应用。
  useEffect(() => {
    applyTheme(theme, styleTheme);

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system", styleTheme);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, styleTheme]);

  return { theme, setTheme, styleTheme, setStyleTheme } as const;
}
