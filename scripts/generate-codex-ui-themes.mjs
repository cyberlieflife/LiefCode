// 把 Codex 的 43 套主题转换为 LiefCode 的完整语义 token。
import fs from "node:fs";

const themes = JSON.parse(fs.readFileSync("scripts/codex-theme-palettes.json", "utf8"));

function parseHex(value) {
  if (typeof value !== "string") return null;
  let hex = value.trim();
  if (!hex.startsWith("#")) return null;
  hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length !== 6 && hex.length !== 8) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function flatten(color, background) {
  const c = parseHex(color);
  const b = parseHex(background);
  if (!c) return background;
  if (c.a >= 1) return toHex(c);
  return toHex({
    r: Math.round(c.r * c.a + b.r * (1 - c.a)),
    g: Math.round(c.g * c.a + b.g * (1 - c.a)),
    b: Math.round(c.b * c.a + b.b * (1 - c.a)),
  });
}

function toHex({ r, g, b }) {
  const part = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function mix(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const w = Math.max(0, Math.min(1, t));
  return toHex({
    r: ca.r + (cb.r - ca.r) * w,
    g: ca.g + (cb.g - ca.g) * w,
    b: ca.b + (cb.b - ca.b) * w,
  });
}

function rgba(color, alpha) {
  const c = parseHex(color);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function luminance(color) {
  const c = parseHex(color);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function readableOn(background) {
  return contrast("#000000", background) >= contrast("#ffffff", background) ? "#000000" : "#ffffff";
}

// 向黑或白移动前景色，直到满足目标对比度。
function ensureContrast(foreground, background, ratio = 4.5) {
  const fg = flatten(foreground, background);
  if (contrast(fg, background) >= ratio) return fg;
  const target = readableOn(background);
  for (let step = 1; step <= 50; step += 1) {
    const candidate = mix(fg, target, step / 50);
    if (contrast(candidate, background) >= ratio) return candidate;
  }
  return target;
}

function pick(colors, keys, fallback) {
  for (const key of keys) {
    const value = colors?.[key];
    const parsed = parseHex(value);
    if (parsed && parsed.a > 0) return flatten(value, fallback);
  }
  return fallback;
}

function buildTheme(theme) {
  const colors = theme.colors ?? {};
  const chrome = theme.chromeTheme ?? {};
  const variant = theme.type === "light" ? "light" : "dark";
  const rawSurface =
    chrome.surface ??
    colors["editor.background"] ??
    colors["sideBar.background"] ??
    (variant === "dark" ? "#181818" : "#ffffff");
  const background = flatten(rawSurface, variant === "dark" ? "#000000" : "#ffffff");
  const inkRaw =
    chrome.ink ??
    colors["editor.foreground"] ??
    colors.foreground ??
    colors["sideBarTitle.foreground"] ??
    (variant === "dark" ? "#ffffff" : "#111111");
  const ink = flatten(inkRaw, background);
  const accentRaw =
    chrome.accent ??
    colors["activityBarBadge.background"] ??
    colors["button.background"] ??
    colors["textLink.foreground"] ??
    colors["editorCursor.foreground"] ??
    colors.focusBorder ??
    (variant === "dark" ? "#339cff" : "#0066cc");
  const accent = flatten(accentRaw, background);

  const semantic = chrome.semanticColors ?? {};
  const green = pick(
    colors,
    ["terminal.ansiGreen", "terminal.ansiBrightGreen", "gitDecoration.addedResourceForeground"],
    semantic.diffAdded ?? (variant === "dark" ? "#3fb950" : "#1a7f37"),
  );
  const red = pick(
    colors,
    ["terminal.ansiRed", "terminal.ansiBrightRed", "gitDecoration.deletedResourceForeground"],
    semantic.diffRemoved ?? (variant === "dark" ? "#f85149" : "#cf222e"),
  );
  const yellow = pick(
    colors,
    ["terminal.ansiYellow", "terminal.ansiBrightYellow", "editorWarning.foreground"],
    variant === "dark" ? "#d29922" : "#9a6700",
  );
  const blue = pick(
    colors,
    ["terminal.ansiBlue", "terminal.ansiBrightBlue", "editorInfo.foreground"],
    accent,
  );
  const magenta = pick(
    colors,
    ["terminal.ansiMagenta", "terminal.ansiBrightMagenta", "charts.purple"],
    semantic.skill ?? (variant === "dark" ? "#bc8cff" : "#8250df"),
  );
  const cyan = pick(
    colors,
    ["terminal.ansiCyan", "terminal.ansiBrightCyan"],
    mix(blue, green, 0.45),
  );
  const purple = flatten(semantic.skill ?? magenta, background);
  const orange = pick(
    colors,
    ["terminal.ansiBrightYellow", "editorWarning.foreground"],
    mix(yellow, red, 0.25),
  );
  const diffAdded = flatten(semantic.diffAdded ?? green, background);
  const diffRemoved = flatten(semantic.diffRemoved ?? red, background);

  const border = variant === "dark" ? mix(background, ink, 0.18) : mix(background, ink, 0.14);
  const borderHover = variant === "dark" ? mix(background, ink, 0.28) : mix(background, ink, 0.24);
  const surface = variant === "dark" ? mix(background, ink, 0.07) : mix(background, ink, 0.05);
  const surfaceHover = variant === "dark" ? mix(background, ink, 0.11) : mix(background, ink, 0.08);
  const card = variant === "dark" ? mix(background, ink, 0.09) : mix(background, "#ffffff", 0.6);
  const cardSelected = variant === "dark" ? mix(background, ink, 0.14) : mix(background, ink, 0.1);
  const sidebar = variant === "dark" ? mix(background, "#000000", 0.24) : mix(background, "#000000", 0.035);
  const selected = variant === "dark" ? mix(background, ink, 0.13) : mix(background, ink, 0.09);
  const accentSurface = variant === "dark" ? mix(background, ink, 0.12) : mix(background, ink, 0.08);
  const terminalBg = variant === "dark" ? mix(background, "#000000", 0.18) : mix(background, "#000000", 0.04);
  const menu = variant === "dark" ? mix(background, ink, 0.1) : "#ffffff";
  const popover = variant === "dark" ? mix(background, ink, 0.1) : "#ffffff";
  const input = variant === "dark" ? mix(background, ink, 0.08) : "#ffffff";
  const tooltip = variant === "dark" ? mix(background, ink, 0.16) : mix(ink, background, 0.15);
  const toast = variant === "dark" ? mix(background, ink, 0.16) : "#ffffff";

  // 正文色必须在所有父表面（含 selected）上都达标，用最接近正文的背景作为目标。
  const parentBackgrounds = [background, surface, card, sidebar, popover, selected];
  const worstParent = parentBackgrounds.reduce(
    (worst, candidate) => (contrast(ink, candidate) < contrast(ink, worst) ? candidate : worst),
    background,
  );
  const foreground = ensureContrast(ink, worstParent, 4.5);
  const foregroundSubtle = ensureContrast(mix(foreground, background, 0.28), worstParent, 4.5);
  const foregroundSubtlest = ensureContrast(mix(foreground, background, 0.45), worstParent, 4.5);
  const remoteMuted = ensureContrast(mix(foreground, background, 0.18), worstParent, 4.5);

  const semanticSurface = (color) =>
    variant === "dark" ? mix(background, color, 0.16) : mix(background, color, 0.12);
  const semanticForeground = (color, onSurface) => ensureContrast(color, onSurface, 4.5);

  const successSurface = semanticSurface(green);
  const warningSurface = semanticSurface(yellow);
  const destructiveSurface = semanticSurface(red);
  const progressSurface = semanticSurface(accent);

  const terminalColors = {
    black: variant === "dark" ? mix(background, ink, 0.38) : mix(background, ink, 0.5),
    red: ensureContrast(red, terminalBg, 3),
    green: ensureContrast(green, terminalBg, 3),
    yellow: ensureContrast(yellow, terminalBg, 3),
    blue: ensureContrast(blue, terminalBg, 3),
    magenta: ensureContrast(magenta, terminalBg, 3),
    cyan: ensureContrast(cyan, terminalBg, 3),
    white: foreground,
  };
  const bright = (color) => mix(color, "#ffffff", variant === "dark" ? 0.18 : 0.12);

  const nodeSurface = (color) =>
    variant === "dark" ? `rgba(${parseHex(color).r}, ${parseHex(color).g}, ${parseHex(color).b}, 0.16)` : `rgba(${parseHex(color).r}, ${parseHex(color).g}, ${parseHex(color).b}, 0.1)`;
  const nodeForeground = (color) => ensureContrast(color, background, 4.5);

  const git = (color) => ensureContrast(color, background, 4.5);
  const olive = mix(yellow, green, 0.5);

  return {
    variant,
    background,
    foreground,
    lines: [
      `  --animated-gradient-text-strong: ${foreground};`,
      `  --animated-gradient-text-soft: ${rgba(foreground, 0.22)};`,
      `  --color-background: ${background};`,
      `  --color-background-win-alt: ${variant === "dark" ? mix(background, ink, 0.1) : mix(background, ink, 0.06)};`,
      `  --color-background-alt: color-mix(in oklab, var(--color-background-win-alt) 60%, transparent);`,
      `  --color-brand: ${accent};`,
      `  --color-trajectory-user: ${accent};`,
      `  --color-trajectory-assistant: ${ensureContrast(green, background, 4.5)};`,
      `  --color-trajectory-reasoning: ${ensureContrast(purple, background, 4.5)};`,
      `  --color-trajectory-tool-call: ${ensureContrast(yellow, background, 4.5)};`,
      `  --color-trajectory-tool-result: ${ensureContrast(cyan, background, 4.5)};`,
      `  --color-workflow-rule: ${rgba(ink, 0.07)};`,
      `  --color-workflow-trace: ${rgba(ink, 0.32)};`,
      `  --color-workflow-trace-strong: ${rgba(ink, 0.58)};`,
      `  --color-accent: ${accentSurface};`,
      `  --color-find-highlight: ${mix(background, yellow, variant === "dark" ? 0.28 : 0.22)};`,
      `  --color-find-highlight-active: ${ensureContrast(yellow, background, 3)};`,
      `  --color-border: ${border};`,
      `  --color-border-hover: ${borderHover};`,
      `  --color-hover: ${rgba(ink, 0.06)};`,
      `  --color-selected: ${selected};`,
      `  --color-header: ${background};`,
      `  --color-panel: ${background};`,
      `  --color-sidebar: ${sidebar};`,
      `  --color-surface: ${surface};`,
      `  --color-surface-hover: ${surfaceHover};`,
      `  --color-card: ${card};`,
      `  --color-card-selected: ${cardSelected};`,
      `  --color-card-border: ${border};`,
      `  --color-popover: ${popover};`,
      `  --color-popover-foreground: var(--color-foreground);`,
      `  --color-popover-header: ${background};`,
      `  --color-popover-border: ${border};`,
      `  --color-input: ${input};`,
      `  --color-input-focused: var(--color-input);`,
      `  --color-input-border: ${border};`,
      `  --color-input-border-hover: ${borderHover};`,
      `  --color-input-border-focused: ${accent};`,
      `  --color-terminal-bg: ${terminalBg};`,
      `  --color-terminal-fg: ${foreground};`,
      `  --color-terminal-cursor: ${foreground};`,
      `  --color-terminal-cursor-accent: ${terminalBg};`,
      `  --color-terminal-selection: ${rgba(accent, 0.28)};`,
      `  --color-terminal-selection-inactive: ${rgba(ink, 0.1)};`,
      `  --color-terminal-black: ${terminalColors.black};`,
      `  --color-terminal-red: ${terminalColors.red};`,
      `  --color-terminal-green: ${terminalColors.green};`,
      `  --color-terminal-yellow: ${terminalColors.yellow};`,
      `  --color-terminal-blue: ${terminalColors.blue};`,
      `  --color-terminal-magenta: ${terminalColors.magenta};`,
      `  --color-terminal-cyan: ${terminalColors.cyan};`,
      `  --color-terminal-white: ${terminalColors.white};`,
      `  --color-terminal-bright-black: ${mix(background, ink, 0.52)};`,
      `  --color-terminal-bright-red: ${bright(terminalColors.red)};`,
      `  --color-terminal-bright-green: ${bright(terminalColors.green)};`,
      `  --color-terminal-bright-yellow: ${bright(terminalColors.yellow)};`,
      `  --color-terminal-bright-blue: ${bright(terminalColors.blue)};`,
      `  --color-terminal-bright-magenta: ${bright(terminalColors.magenta)};`,
      `  --color-terminal-bright-cyan: ${bright(terminalColors.cyan)};`,
      `  --color-terminal-bright-white: ${mix(ink, "#ffffff", 0.25)};`,
      `  --color-usage-chart-1: ${accent};`,
      `  --color-usage-chart-2: ${ensureContrast(green, background, 3)};`,
      `  --color-usage-chart-3: ${ensureContrast(purple, background, 3)};`,
      `  --color-usage-chart-4: ${ensureContrast(red, background, 3)};`,
      `  --color-usage-chart-5: ${ensureContrast(yellow, background, 3)};`,
      `  --color-usage-chart-6: ${ensureContrast(cyan, background, 3)};`,
      `  --color-context-breakdown-1: ${accent};`,
      `  --color-context-breakdown-2: ${mix(accent, background, 0.14)};`,
      `  --color-context-breakdown-3: ${mix(accent, background, 0.28)};`,
      `  --color-context-breakdown-4: ${mix(accent, background, 0.42)};`,
      `  --color-context-breakdown-5: ${mix(accent, background, 0.56)};`,
      `  --color-context-breakdown-6: ${mix(accent, background, 0.7)};`,
      `  --color-context-breakdown-7: ${mix(accent, background, 0.84)};`,
      `  --color-usage-heatmap-0: color-mix(in oklab, ${accent} 0%, var(--color-surface));`,
      `  --color-usage-heatmap-1: color-mix(in oklab, ${accent} 24%, var(--color-surface));`,
      `  --color-usage-heatmap-2: color-mix(in oklab, ${accent} 42%, var(--color-surface));`,
      `  --color-usage-heatmap-3: color-mix(in oklab, ${accent} 62%, var(--color-surface));`,
      `  --color-usage-heatmap-4: color-mix(in oklab, ${mix(accent, "#ffffff", 0.2)} 78%, var(--color-surface));`,
      `  --color-tab: ${background};`,
      `  --color-tab-active: ${accentSurface};`,
      `  --color-tab-border: ${border};`,
      `  --color-menu: ${menu};`,
      `  --color-menu-hover: ${variant === "dark" ? mix(background, ink, 0.14) : mix(background, ink, 0.06)};`,
      `  --color-primary: ${accent};`,
      `  --color-primary-foreground: ${readableOn(accent)};`,
      `  --color-secondary: ${variant === "dark" ? mix(background, ink, 0.14) : mix(background, ink, 0.1)};`,
      `  --color-interaction-ask-surface: ${accentSurface};`,
      `  --color-interaction-ask-foreground: ${ensureContrast(accent, accentSurface, 4.5)};`,
      `  --color-interaction-ask-fill: ${rgba(green, 0.22)};`,
      `  --color-interaction-confirmation-surface: ${successSurface};`,
      `  --color-interaction-confirmation-foreground: ${semanticForeground(green, successSurface)};`,
      `  --color-success-surface: ${successSurface};`,
      `  --color-success-surface-foreground: ${semanticForeground(green, successSurface)};`,
      `  --color-progress-surface: ${progressSurface};`,
      `  --color-progress-surface-foreground: ${semanticForeground(accent, progressSurface)};`,
      `  --color-foreground: ${foreground};`,
      `  --color-foreground-subtle: ${foregroundSubtle};`,
      `  --color-remote-foreground-muted: ${remoteMuted};`,
      `  --color-foreground-subtlest: ${foregroundSubtlest};`,
      `  --lucide-subtlest-opacity: ${variant === "dark" ? "0.3" : "0.4"};`,
      `  --color-foreground-inverse: ${readableOn(background)};`,
      `  --color-success: ${ensureContrast(green, background, 3)};`,
      `  --color-success-foreground: ${readableOn(ensureContrast(green, background, 3))};`,
      `  --color-idle-task: ${ensureContrast(purple, background, 3)};`,
      `  --color-idle-task-surface: ${semanticSurface(purple)};`,
      `  --color-destructive: ${ensureContrast(red, background, 3)};`,
      `  --color-destructive-foreground: ${readableOn(ensureContrast(red, background, 3))};`,
      `  --color-warning: ${ensureContrast(yellow, background, 3)};`,
      `  --color-feedback-privacy-hint: ${ensureContrast(yellow, background, 3)};`,
      `  --color-warning-foreground: ${readableOn(ensureContrast(yellow, background, 3))};`,
      `  --color-warning-surface: ${warningSurface};`,
      `  --color-warning-surface-foreground: ${semanticForeground(yellow, warningSurface)};`,
      `  --color-destructive-surface: ${destructiveSurface};`,
      `  --color-destructive-surface-foreground: ${semanticForeground(red, destructiveSurface)};`,
      `  --color-diff-added: ${git(diffAdded)};`,
      `  --color-diff-added-foreground: ${readableOn(git(diffAdded))};`,
      `  --color-diff-removed: ${git(diffRemoved)};`,
      `  --color-diff-removed-foreground: ${readableOn(git(diffRemoved))};`,
      `  --color-git-none: var(--color-foreground);`,
      `  --color-git-modified: ${git(yellow)};`,
      `  --color-git-added: ${git(green)};`,
      `  --color-git-deleted: ${git(red)};`,
      `  --color-git-renamed: ${git(blue)};`,
      `  --color-git-untracked: ${git(green)};`,
      `  --color-git-ignored: var(--color-foreground-subtlest);`,
      `  --color-git-descendant: ${git(yellow)};`,
      `  --color-toast: ${toast};`,
      `  --color-tooltip: ${tooltip};`,
      `  --color-tooltip-foreground: ${ensureContrast(foreground, tooltip, 4.5)};`,
      `  --color-tooltip-tag: ${mix(tooltip, ink, 0.18)};`,
      `  --color-tooltip-tag-foreground: ${ensureContrast(mix(foreground, tooltip, 0.3), tooltip, 4.5)};`,
      `  --color-tag: ${variant === "dark" ? mix(background, ink, 0.14) : mix(background, ink, 0.08)};`,
      `  --color-remote-ssh-surface: ${rgba(blue, 0.16)};`,
      `  --color-remote-ssh-foreground: ${ensureContrast(blue, mix(worstParent, blue, 0.16), 4.6)};`,
      `  --color-remote-ssh-border: ${rgba(blue, 0.42)};`,
      `  --color-remote-wsl-surface: ${rgba(green, 0.16)};`,
      `  --color-remote-wsl-foreground: ${ensureContrast(green, mix(worstParent, green, 0.16), 4.6)};`,
      `  --color-remote-wsl-border: ${rgba(green, 0.42)};`,
      `  --color-remote-docker-surface: ${rgba(purple, 0.16)};`,
      `  --color-remote-docker-foreground: ${ensureContrast(purple, mix(worstParent, purple, 0.16), 4.6)};`,
      `  --color-remote-docker-border: ${rgba(purple, 0.42)};`,
      `  --color-file-node: ${nodeSurface(blue)};`,
      `  --color-file-node-hover: ${nodeSurface(blue).replace(/0\.1\)$/, "0.18)").replace(/0\.16\)$/, "0.22)")};`,
      `  --color-file-node-foreground: ${nodeForeground(blue)};`,
      `  --color-skill-node: ${nodeSurface(purple)};`,
      `  --color-skill-node-hover: ${nodeSurface(purple).replace(/0\.1\)$/, "0.18)").replace(/0\.16\)$/, "0.22)")};`,
      `  --color-skill-node-foreground: ${nodeForeground(purple)};`,
      `  --color-command-node: ${nodeSurface(mix(ink, background, 0.4))};`,
      `  --color-command-node-hover: ${nodeSurface(mix(ink, background, 0.4)).replace(/0\.1\)$/, "0.18)").replace(/0\.16\)$/, "0.22)")};`,
      `  --color-command-node-foreground: ${nodeForeground(mix(ink, background, 0.35))};`,
      `  --color-subagent-node: ${nodeSurface(olive)};`,
      `  --color-subagent-node-hover: ${nodeSurface(olive).replace(/0\.1\)$/, "0.18)").replace(/0\.16\)$/, "0.22)")};`,
      `  --color-subagent-node-foreground: ${nodeForeground(olive)};`,
      `  --color-session-node: ${nodeSurface(cyan)};`,
      `  --color-session-node-hover: ${nodeSurface(cyan).replace(/0\.1\)$/, "0.18)").replace(/0\.16\)$/, "0.22)")};`,
      `  --color-session-node-foreground: ${nodeForeground(cyan)};`,
      `  --color-plugin-node: ${nodeSurface(orange)};`,
      `  --color-plugin-node-hover: ${nodeSurface(orange).replace(/0\.1\)$/, "0.18)").replace(/0\.16\)$/, "0.22)")};`,
      `  --color-plugin-node-foreground: ${nodeForeground(orange)};`,
      `  --color-plugin-paid-plan-badge: ${mix(background, yellow, variant === "dark" ? 0.2 : 0.16)};`,
      `  --color-plugin-paid-plan-badge-foreground: ${ensureContrast(yellow, mix(background, yellow, variant === "dark" ? 0.2 : 0.16), 4.5)};`,
    ],
  };
}

const FAMILY_BY_ID = {
  "ayu-dark": "Ayu",
  "catppuccin-latte": "Catppuccin",
  "catppuccin-mocha": "Catppuccin",
  "absolutely-dark": "Absolutely",
  "absolutely-light": "Absolutely",
  "codex-dark": "Codex",
  "codex-light": "Codex",
  dracula: "Dracula",
  "everforest-dark": "Everforest",
  "everforest-light": "Everforest",
  "github-dark-default": "GitHub",
  "github-light-default": "GitHub",
  "gruvbox-dark-medium": "Gruvbox",
  "gruvbox-light-medium": "Gruvbox",
  "linear-dark": "Linear",
  "linear-light": "Linear",
  "lobster-dark": "Lobster",
  "material-theme-darker": "Material",
  "matrix-dark": "Matrix",
  monokai: "Monokai",
  "night-owl": "Night Owl",
  nord: "Nord",
  "notion-dark": "Notion",
  "notion-light": "Notion",
  oscurange: "Oscurange",
  "one-dark-pro": "One",
  "one-light": "One",
  "proof-light": "Proof",
  "raycast-dark": "Raycast",
  "raycast-light": "Raycast",
  "rose-pine-dawn": "Rose Pine",
  "rose-pine-moon": "Rose Pine",
  "sentry-dark": "Sentry",
  "solarized-dark": "Solarized",
  "solarized-light": "Solarized",
  "tokyo-night": "Tokyo Night",
  "temple-dark": "Temple",
  "vercel-dark": "Vercel",
  "vercel-light": "Vercel",
  "dark-plus": "VS Code Plus",
  "light-plus": "VS Code Plus",
  "xcode-dark": "Xcode",
  "xcode-light": "Xcode",
};

const blocks = [];
const manifest = [];
const violations = [];
for (const theme of themes) {
  const built = buildTheme(theme);
  blocks.push(`/* ${theme.name} */\n.theme-${theme.id} {\n${built.lines.join("\n")}\n}`);
  manifest.push({
    id: theme.id,
    label: theme.name,
    family: FAMILY_BY_ID[theme.id] ?? theme.name,
    variant: built.variant,
    background: built.background,
  });

  // 校验正文与语义表面在主要父背景上的对比度。
  const declarations = new Map(
    built.lines
      .map((line) => line.match(/^\s*(--[\w-]+):\s*([^;]+);$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]),
  );
  const bg = declarations.get("--color-background");
  for (const parent of ["--color-background", "--color-surface", "--color-card", "--color-sidebar", "--color-popover", "--color-selected"]) {
    const parentColor = declarations.get(parent);
    if (!parseHex(parentColor)) continue;
    for (const semanticName of ["warning", "destructive", "success", "progress"]) {
      const surfaceColor = declarations.get(`--color-${semanticName}-surface`);
      const foregroundColor = declarations.get(`--color-${semanticName}-surface-foreground`);
      if (!parseHex(surfaceColor) || !parseHex(foregroundColor)) continue;
      const ratio = contrast(foregroundColor, surfaceColor);
      if (ratio < 4.5) violations.push(`${theme.id}/${parent}/${semanticName} ${ratio.toFixed(2)}`);
    }
  }
}

fs.writeFileSync("D:/tmp/codex-themes/out/codex-themes.css", blocks.join("\n\n") + "\n");

const ids = manifest.map((item) => JSON.stringify(item.id)).join("\n  | ");
const ts = `/**
 * Codex 桌面程序内置的代码主题。数据由 scripts/generate-codex-ui-themes.mjs 生成。
 * 这些 id 同时是配色方案的持久化值和 CSS class 后缀（theme-<id>）。
 */
export type CodexUiThemeVariant = "light" | "dark";

export type CodexUiThemeId =
  | ${ids};

export interface CodexUiTheme {
  id: CodexUiThemeId;
  label: string;
  family: string;
  variant: CodexUiThemeVariant;
  background: string;
}

export const CODEX_UI_THEMES: readonly CodexUiTheme[] = ${JSON.stringify(manifest, null, 2)};

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
`;
const stylesPath = "packages/ui/src/styles.css";
const styles = fs.readFileSync(stylesPath, "utf8");
const styleEol = styles.includes("\r\n") ? "\r\n" : "\n";
const styleLines = styles.split(styleEol);
const codexComment = styleLines.findIndex((line) => line.includes("Codex 配色："));
const claudeComment = styleLines.findIndex((line) => line.includes("=== Claude 样式主题层 ==="));
if (codexComment < 0 || claudeComment < 0) throw new Error("styles.css theme markers not found");
const nextStyles = [
  ...styleLines.slice(0, codexComment),
  "/*",
  " * Codex 配色：Codex 桌面程序内置的全部代码主题。",
  " * 由 scripts/generate-codex-ui-themes.mjs 生成，标记区间内不要手工编辑。",
  " */",
  "/* BEGIN GENERATED CODEX THEMES */",
  ...blocks.join("\n\n").split("\n"),
  "",
  "/* END GENERATED CODEX THEMES */",
  "",
  ...styleLines.slice(claudeComment),
].join(styleEol);
fs.writeFileSync(stylesPath, nextStyles);

fs.writeFileSync("packages/ui/src/lib/codexThemes.ts", ts);

const indexPath = "packages/web/index.html";
const html = fs.readFileSync(indexPath, "utf8");
const htmlEol = html.includes("\r\n") ? "\r\n" : "\n";
const join = (items) => items.join(htmlEol);
const entries = manifest.map(
  (theme) => `          ${JSON.stringify(theme.id)}: ${JSON.stringify(theme.variant)},`,
);
const backgrounds = manifest.map(
  (theme) => `          ${JSON.stringify(theme.id)}: ${JSON.stringify(theme.background)},`,
);
const classes = manifest.map((theme) => `          "theme-${theme.id}",`);
const paletteBlock = join([
  "        // 配色家族各自的明暗与画布色，用于首帧 theme-color；System 归入 Zai。",
  "        const PALETTE_VARIANTS = {",
  '          "zai-dark": "dark",',
  '          "zai-light": "light",',
  '          "claude-dark": "dark",',
  '          "claude-light": "light",',
  ...entries,
  "        };",
  "        const PALETTE_BACKGROUNDS = {",
  '          "zai-dark": "#161616",',
  '          "zai-light": "#f8f8f8",',
  '          "claude-dark": "#181715",',
  '          "claude-light": "#faf9f5",',
  ...backgrounds,
  "        };",
  "        const PALETTE_CLASSES = [",
  '          "theme-zai-light",',
  '          "theme-zai-dark",',
  '          "theme-claude-light",',
  '          "theme-claude-dark",',
  ...classes,
  "        ];",
]);
const paletteStart = html.indexOf("        // 配色家族各自的明暗与画布色");
const styleClassesStart = html.indexOf("        const STYLE_CLASSES =");
if (paletteStart < 0 || styleClassesStart < 0) throw new Error("index.html palette block not found");
fs.writeFileSync(
  indexPath,
  html.slice(0, paletteStart) + paletteBlock + htmlEol + html.slice(styleClassesStart),
);

console.log(`generated ${manifest.length} themes, ${violations.length} contrast violations`);
if (violations.length) {
  console.log(violations.slice(0, 40).join("\n"));
  process.exitCode = 1;
}
