import { useEffect, useState, useCallback } from "react";

export type Theme =
  | "light"
  | "dark"
  | "zai-light"
  | "zai-dark"
  | "claude-light"
  | "claude-dark"
  | "system";
export type ResolvedTheme = "light" | "dark";

/**
 * 样式主题（几何、阴影、排版）与配色主题分开。
 * 界面上不单独暴露样式选择器：选中 Claude 配色时同时挂上 Claude 样式层。
 */
export type StyleTheme = "default" | "claude";

const STORAGE_KEY = "zcode-theme";
const BROWSER_THEME_SURFACE_ATTRIBUTE = "data-zcode-browser-theme-surface";
/** 挂在 documentElement 上的配色类，取值与 Theme 的非 system 值一一对应。 */
const THEME_CLASS_NAMES = [
  "theme-zai-light",
  "theme-zai-dark",
  "theme-claude-light",
  "theme-claude-dark",
] as const;
/** 样式主题层类名，独立于配色类。 */
const STYLE_THEME_CLASS_NAME = "style-claude";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function isClaudeTheme(theme: Theme): boolean {
  return theme === "claude-light" || theme === "claude-dark";
}

export function resolveStyleTheme(theme: Theme): StyleTheme {
  return isClaudeTheme(theme) ? "claude" : "default";
}

/** 不含 system 的主题直接映射明暗，供无 window 环境（如 SSR 兜底）复用。 */
export function resolveStaticTheme(theme: Exclude<Theme, "system">): ResolvedTheme {
  return theme === "dark" || theme === "zai-dark" || theme === "claude-dark" ? "dark" : "light";
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

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  const appliedTheme = resolveAppliedTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // 配色类按 appliedTheme 逐一收敛，避免切换时残留上一个配色类的变量。
  for (const className of THEME_CLASS_NAMES) {
    document.documentElement.classList.toggle(className, `theme-${appliedTheme}` === className);
  }
  // 样式主题层独立切换：Claude 配色带 Claude 样式，其余配色回落默认样式。
  document.documentElement.classList.toggle(
    STYLE_THEME_CLASS_NAME,
    resolveStyleTheme(theme) === "claude",
  );
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
    value === "system"
  );
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // 默认主题统一收敛到 Zai dark，避免旧 hook 兜底值和 Zustand store 默认值分叉。
    return isTheme(saved) ? normalizeThemePreference(saved) : "zai-dark";
  });

  const setTheme = useCallback((t: Theme) => {
    const normalizedTheme = normalizeThemePreference(t);
    localStorage.setItem(STORAGE_KEY, normalizedTheme);
    setThemeState(normalizedTheme);
    applyTheme(normalizedTheme);
  }, []);

  // 初始化 + system 模式下监听系统偏好变化
  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme } as const;
}
