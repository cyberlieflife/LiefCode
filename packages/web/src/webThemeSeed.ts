import { isTheme, normalizeThemePreference, type Theme } from "@zcode/ui/useTheme";

type WebThemeSeed = Theme;

export const WEB_DEFAULT_THEME: WebThemeSeed = "zai-dark";

export function resolveWebInitialTheme({
  storedTheme,
  defaultTheme = WEB_DEFAULT_THEME,
}: {
  storedTheme?: string | null;
  defaultTheme?: WebThemeSeed;
}): WebThemeSeed {
  // 主题取值集合由 useTheme 统一维护，Web 首屏种子不再单独维护一份白名单。
  if (isTheme(storedTheme)) {
    return normalizeThemePreference(storedTheme) as WebThemeSeed;
  }

  return normalizeThemePreference(defaultTheme) as WebThemeSeed;
}
