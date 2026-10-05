import type { StyleTheme } from "@/useTheme.js";

interface WorkspaceShellWindowChromeOptions {
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
  isLinuxDesktop?: boolean;
  macOSMajorVersion?: number | null;
  isWindowsMaximized: boolean;
  supportsNativeRoundedCorners: boolean | null;
  /** 样式主题；Claude 会把渲染进程自绘的窗口外形圆角放大。 */
  styleTheme?: StyleTheme;
}

type WorkspaceShellPlatformRadiusOptions = Pick<
  WorkspaceShellWindowChromeOptions,
  "isMacDesktop" | "isWindowsDesktop" | "isLinuxDesktop" | "macOSMajorVersion" | "styleTheme"
>;

/** Claude 样式下渲染进程自绘的窗口外形圆角，对应 DESIGN.md 的 xl 档。 */
const CLAUDE_PANEL_RADIUS_PX = 16;

export function resolveWorkspaceShellPanelRadiusPx({
  isMacDesktop,
  isWindowsDesktop,
  macOSMajorVersion,
  styleTheme = "default",
}: WorkspaceShellPlatformRadiusOptions): number {
  // macOS 的面板圆角用于和系统绘制的原生窗口角同心，不能跟随样式主题改大，
  // 否则 4px 留白不再是同心圆。Windows/Linux 的窗口外形由渲染进程自绘，可以跟随。
  if (isMacDesktop) return (macOSMajorVersion ?? 0) >= 26 ? 12 : 6;
  if (styleTheme === "claude") return CLAUDE_PANEL_RADIUS_PX;
  if (isWindowsDesktop) return 5;
  return 12;
}

export function resolveWorkspaceShellResizeHandleInsetPx(
  options: WorkspaceShellPlatformRadiusOptions,
): number {
  return resolveWorkspaceShellPanelRadiusPx(options) + 4;
}

export function resolveWorkspaceShellWindowChromeClass({
  isMacDesktop,
  isWindowsDesktop,
  isLinuxDesktop,
  macOSMajorVersion,
  supportsNativeRoundedCorners,
  styleTheme = "default",
}: WorkspaceShellWindowChromeOptions): string {
  // Linux 面板圆角走 rounded-xl；Claude 样式下该档正好等于窗口外形圆角。
  if (isLinuxDesktop) return "rounded-xl border border-border";

  if (isWindowsDesktop && styleTheme === "claude") {
    // Claude 样式的窗口外形由渲染进程自绘，四角都按 DESIGN.md 的 xl 档收圆。
    // 这条分支不区分原生圆角能力：Claude 主题要的是一致的外形，Windows 10 也照样绘制。
    // 必须用字面量类名：Tailwind 只生成源码里出现过的类，拼接出来的类名不会进产物。
    // Claude 样式下 rounded-xl 即为 CLAUDE_PANEL_RADIUS_PX。
    return "rounded-xl border border-border";
  }

  if (isMacDesktop) {
    // macOS 面板圆角存在的意义是和系统绘制的原生窗口角同心，不能跟随样式主题放大，
    // 否则 4px 留白不再是同心圆。这里用显式像素值，避免 rounded-xl 被样式主题改写后
    // 与 --workspace-panel-radius 的实际取值分叉。
    const radius = resolveWorkspaceShellPanelRadiusPx({ isMacDesktop, macOSMajorVersion });
    return radius === 6 ? "rounded-[6px] border border-border" : "rounded-[12px] border border-border";
  }

  if (supportsNativeRoundedCorners === null) {
    // bridge 不可用或首次查询尚未完成时，不能把“未知”直接解释成 Windows 10。
    // 保持改动前样式，避免 Win11 在失败路径永久退化为直角外观。
    return "rounded-[5px] border border-border";
  }

  if (!supportsNativeRoundedCorners) {
    // 仅按 Windows 平台统一绘制右侧圆角，会在不支持原生圆角的 Windows 10
    // 上伪造一层窗口外形。只收直右侧外角，不能顺带删除面板原有的三条弱边框。
    return "rounded-l-[5px] border border-border";
  }

  // 旧最大化规则把面板当成系统窗口外沿，清除了圆角和三条边框。
  // 面板现有独立的 4px 留白，最大化时也必须保持完整圆角与边框。
  // Windows 外沿内缩 4px 后，12px 圆角会形成过厚的弧形留白；布局面板统一使用 5px。
  return "rounded-[5px] border border-border";
}
