/**
 * Codex 桌面程序内置的代码主题。数据由 scripts/generate-codex-ui-themes.mjs 生成。
 * 这些 id 同时是配色方案的持久化值和 CSS class 后缀（theme-<id>）。
 */
export type CodexUiThemeVariant = "light" | "dark";

export type CodexUiThemeId =
  | "absolutely-dark"
  | "absolutely-light"
  | "ayu-dark"
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "codex-dark"
  | "codex-light"
  | "dark-plus"
  | "dracula"
  | "everforest-dark"
  | "everforest-light"
  | "github-dark-default"
  | "github-light-default"
  | "gruvbox-dark-medium"
  | "gruvbox-light-medium"
  | "light-plus"
  | "linear-dark"
  | "linear-light"
  | "lobster-dark"
  | "material-theme-darker"
  | "matrix-dark"
  | "monokai"
  | "night-owl"
  | "nord"
  | "notion-dark"
  | "notion-light"
  | "one-dark-pro"
  | "one-light"
  | "oscurange"
  | "proof-light"
  | "raycast-dark"
  | "raycast-light"
  | "rose-pine-dawn"
  | "rose-pine-moon"
  | "sentry-dark"
  | "solarized-dark"
  | "solarized-light"
  | "temple-dark"
  | "tokyo-night"
  | "vercel-dark"
  | "vercel-light"
  | "xcode-dark"
  | "xcode-light";

export interface CodexUiTheme {
  id: CodexUiThemeId;
  label: string;
  family: string;
  variant: CodexUiThemeVariant;
  background: string;
}

export const CODEX_UI_THEMES: readonly CodexUiTheme[] = [
  {
    "id": "absolutely-dark",
    "label": "Absolutely Dark",
    "family": "Absolutely",
    "variant": "dark",
    "background": "#2d2d2b"
  },
  {
    "id": "absolutely-light",
    "label": "Absolutely Light",
    "family": "Absolutely",
    "variant": "light",
    "background": "#f9f9f7"
  },
  {
    "id": "ayu-dark",
    "label": "ayu-dark",
    "family": "Ayu",
    "variant": "dark",
    "background": "#10141c"
  },
  {
    "id": "catppuccin-latte",
    "label": "catppuccin-latte",
    "family": "Catppuccin",
    "variant": "light",
    "background": "#eff1f5"
  },
  {
    "id": "catppuccin-mocha",
    "label": "catppuccin-mocha",
    "family": "Catppuccin",
    "variant": "dark",
    "background": "#1e1e2e"
  },
  {
    "id": "codex-dark",
    "label": "Codex Dark",
    "family": "Codex",
    "variant": "dark",
    "background": "#111111"
  },
  {
    "id": "codex-light",
    "label": "Codex Light",
    "family": "Codex",
    "variant": "light",
    "background": "#ffffff"
  },
  {
    "id": "dark-plus",
    "label": "dark-plus",
    "family": "VS Code Plus",
    "variant": "dark",
    "background": "#1e1e1e"
  },
  {
    "id": "dracula",
    "label": "dracula",
    "family": "Dracula",
    "variant": "dark",
    "background": "#282a36"
  },
  {
    "id": "everforest-dark",
    "label": "everforest-dark",
    "family": "Everforest",
    "variant": "dark",
    "background": "#2d353b"
  },
  {
    "id": "everforest-light",
    "label": "everforest-light",
    "family": "Everforest",
    "variant": "light",
    "background": "#fdf6e3"
  },
  {
    "id": "github-dark-default",
    "label": "github-dark-default",
    "family": "GitHub",
    "variant": "dark",
    "background": "#0d1117"
  },
  {
    "id": "github-light-default",
    "label": "github-light-default",
    "family": "GitHub",
    "variant": "light",
    "background": "#ffffff"
  },
  {
    "id": "gruvbox-dark-medium",
    "label": "gruvbox-dark-medium",
    "family": "Gruvbox",
    "variant": "dark",
    "background": "#282828"
  },
  {
    "id": "gruvbox-light-medium",
    "label": "gruvbox-light-medium",
    "family": "Gruvbox",
    "variant": "light",
    "background": "#fbf1c7"
  },
  {
    "id": "light-plus",
    "label": "light-plus",
    "family": "VS Code Plus",
    "variant": "light",
    "background": "#ffffff"
  },
  {
    "id": "linear-dark",
    "label": "Linear Dark",
    "family": "Linear",
    "variant": "dark",
    "background": "#0f0f11"
  },
  {
    "id": "linear-light",
    "label": "Linear Light",
    "family": "Linear",
    "variant": "light",
    "background": "#fcfcfd"
  },
  {
    "id": "lobster-dark",
    "label": "Lobster Dark",
    "family": "Lobster",
    "variant": "dark",
    "background": "#111827"
  },
  {
    "id": "material-theme-darker",
    "label": "material-theme-darker",
    "family": "Material",
    "variant": "dark",
    "background": "#212121"
  },
  {
    "id": "matrix-dark",
    "label": "Matrix Dark",
    "family": "Matrix",
    "variant": "dark",
    "background": "#040805"
  },
  {
    "id": "monokai",
    "label": "monokai",
    "family": "Monokai",
    "variant": "dark",
    "background": "#272822"
  },
  {
    "id": "night-owl",
    "label": "night-owl",
    "family": "Night Owl",
    "variant": "dark",
    "background": "#011627"
  },
  {
    "id": "nord",
    "label": "nord",
    "family": "Nord",
    "variant": "dark",
    "background": "#2e3440"
  },
  {
    "id": "notion-dark",
    "label": "Notion Dark",
    "family": "Notion",
    "variant": "dark",
    "background": "#191919"
  },
  {
    "id": "notion-light",
    "label": "Notion Light",
    "family": "Notion",
    "variant": "light",
    "background": "#ffffff"
  },
  {
    "id": "one-dark-pro",
    "label": "one-dark-pro",
    "family": "One",
    "variant": "dark",
    "background": "#282c34"
  },
  {
    "id": "one-light",
    "label": "one-light",
    "family": "One",
    "variant": "light",
    "background": "#fafafa"
  },
  {
    "id": "oscurange",
    "label": "Oscurange",
    "family": "Oscurange",
    "variant": "dark",
    "background": "#0b0b0f"
  },
  {
    "id": "proof-light",
    "label": "Proof Light",
    "family": "Proof",
    "variant": "light",
    "background": "#f5f3ed"
  },
  {
    "id": "raycast-dark",
    "label": "Raycast Dark",
    "family": "Raycast",
    "variant": "dark",
    "background": "#101010"
  },
  {
    "id": "raycast-light",
    "label": "Raycast Light",
    "family": "Raycast",
    "variant": "light",
    "background": "#ffffff"
  },
  {
    "id": "rose-pine-dawn",
    "label": "rose-pine-dawn",
    "family": "Rose Pine",
    "variant": "light",
    "background": "#faf4ed"
  },
  {
    "id": "rose-pine-moon",
    "label": "rose-pine-moon",
    "family": "Rose Pine",
    "variant": "dark",
    "background": "#232136"
  },
  {
    "id": "sentry-dark",
    "label": "Sentry Dark",
    "family": "Sentry",
    "variant": "dark",
    "background": "#2d2935"
  },
  {
    "id": "solarized-dark",
    "label": "solarized-dark",
    "family": "Solarized",
    "variant": "dark",
    "background": "#002b36"
  },
  {
    "id": "solarized-light",
    "label": "solarized-light",
    "family": "Solarized",
    "variant": "light",
    "background": "#fdf6e3"
  },
  {
    "id": "temple-dark",
    "label": "Temple Dark",
    "family": "Temple",
    "variant": "dark",
    "background": "#02120c"
  },
  {
    "id": "tokyo-night",
    "label": "tokyo-night",
    "family": "Tokyo Night",
    "variant": "dark",
    "background": "#1a1b26"
  },
  {
    "id": "vercel-dark",
    "label": "Vercel Dark",
    "family": "Vercel",
    "variant": "dark",
    "background": "#000000"
  },
  {
    "id": "vercel-light",
    "label": "Vercel Light",
    "family": "Vercel",
    "variant": "light",
    "background": "#ffffff"
  },
  {
    "id": "xcode-dark",
    "label": "Xcode Dark",
    "family": "Xcode",
    "variant": "dark",
    "background": "#1f1f24"
  },
  {
    "id": "xcode-light",
    "label": "Xcode Light",
    "family": "Xcode",
    "variant": "light",
    "background": "#ffffff"
  }
];

export const CODEX_UI_THEME_IDS: readonly CodexUiThemeId[] = CODEX_UI_THEMES.map(
  (theme) => theme.id,
);

const CODEX_UI_THEME_ID_SET: ReadonlySet<string> = new Set(CODEX_UI_THEME_IDS);

export function isCodexUiThemeId(value: string | null | undefined): value is CodexUiThemeId {
  return typeof value === "string" && CODEX_UI_THEME_ID_SET.has(value);
}

export function getCodexUiTheme(id: string): CodexUiTheme | undefined {
  return CODEX_UI_THEMES.find((theme) => theme.id === id);
}
