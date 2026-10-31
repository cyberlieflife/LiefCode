// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readStyleThemePreference, toggleThemeMode } from "@/useTheme.js";
import { CODEX_UI_THEMES } from "@/lib/codexThemes.js";

beforeEach(() => {
  document.head.innerHTML = "";
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-zcode-browser-theme-surface");
  document.documentElement.removeAttribute("style");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applyTheme", () => {
  it.each([
    ["zai-dark", "dark", "#161616"],
    ["zai-light", "light", "#f8f8f8"],
    ["codex-dark", "dark", "#111111"],
    ["codex-light", "light", "#ffffff"],
  ] as const)("把 %s 同步到已 opt-in 的浏览器主题表面", (theme, resolvedTheme, background) => {
    document.documentElement.setAttribute("data-zcode-browser-theme-surface", "light");
    document.documentElement.style.setProperty("--color-background", background);
    document.head.innerHTML = `
        <meta name="theme-color" content="#ffffff" />
        <meta name="color-scheme" content="light" />
      `;

    applyTheme(theme);

    expect(document.documentElement.getAttribute("data-zcode-browser-theme-surface")).toBe(
      resolvedTheme,
    );
    expect(document.documentElement.style.colorScheme).toBe(resolvedTheme);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      background,
    );
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      resolvedTheme,
    );
  });

  it("system 模式用浏览器偏好同步同一份 resolved theme", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    document.documentElement.setAttribute("data-zcode-browser-theme-surface", "light");
    document.documentElement.style.setProperty("--color-background", "#161616");

    applyTheme("system");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-zai-dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-zcode-browser-theme-surface")).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#161616",
    );
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "dark",
    );
  });

  it("未 opt-in 的 Electron 页面只切换既有主题 class", () => {
    applyTheme("zai-dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-zai-dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("");
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
    expect(document.querySelector('meta[name="color-scheme"]')).toBeNull();
  });

  it("轻量 DOM shim 未提供浏览器表面能力时仍保留既有 class 切换", () => {
    const toggle = vi.fn();
    vi.stubGlobal("document", {
      documentElement: {
        classList: { toggle },
      },
    });

    expect(() => applyTheme("zai-dark")).not.toThrow();
    // dark + 全部配色类 + 三个 UI 方案类逐一收敛。
    expect(toggle).toHaveBeenCalledTimes(1 + 2 + 2 + CODEX_UI_THEMES.length + 3);
  });

  it("配色方案与 UI 方案独立应用", () => {
    applyTheme("codex-dark", "claude");

    expect(document.documentElement.classList.contains("theme-codex-dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-zai-dark")).toBe(false);
    expect(document.documentElement.classList.contains("style-claude")).toBe(true);
    expect(document.documentElement.classList.contains("style-codex")).toBe(false);
    expect(document.documentElement.classList.contains("style-default")).toBe(false);
  });

  it("未保存 UI 方案时 Claude 配色沿用 Claude 样式，Codex 配色使用默认样式", () => {
    applyTheme("claude-light");
    expect(document.documentElement.classList.contains("style-claude")).toBe(true);

    applyTheme("codex-light");
    expect(document.documentElement.classList.contains("style-claude")).toBe(false);
    expect(document.documentElement.classList.contains("style-default")).toBe(true);
  });
});

describe("readStyleThemePreference", () => {
  it("显式 UI 方案优先于配色推导", () => {
    localStorage.setItem("zcode-style-theme", "codex");

    expect(readStyleThemePreference("claude-dark")).toBe("codex");
  });

  it("缺失或非法时按配色迁移", () => {
    localStorage.removeItem("zcode-style-theme");
    expect(readStyleThemePreference("claude-dark")).toBe("claude");

    localStorage.setItem("zcode-style-theme", "legacy");
    expect(readStyleThemePreference("zai-dark")).toBe("default");
  });
});

describe("toggleThemeMode", () => {
  it("只翻转明暗，保留配色家族", () => {
    expect(toggleThemeMode("zai-dark")).toBe("zai-light");
    expect(toggleThemeMode("claude-light")).toBe("claude-dark");
    expect(toggleThemeMode("codex-dark")).toBe("codex-light");
    expect(toggleThemeMode("github-dark-default")).toBe("github-light-default");
    expect(toggleThemeMode("one-light")).toBe("one-dark-pro");
  });

  it("system 按系统偏好翻转并归入 Zai", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );

    expect(toggleThemeMode("system")).toBe("zai-light");
  });
});
