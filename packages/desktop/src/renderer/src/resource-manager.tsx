import { createRoot } from "react-dom/client";
import type {
  NetworkCaptureBridge,
  ResourceUsageSnapshot,
  StorageManagementBridge,
} from "@zcode/shared";
import "@zcode/ui/styles.css";
import {
  ResourceManagerApp,
  ZCodeIntlProvider,
  applyTheme,
  applyUiCardStyle,
  applyUiFontFamily,
  applyUiFontSizePx,
  isTheme,
  loadUiCardStyle,
  loadUiFontFamily,
  loadUiFontSizePx,
  readStyleThemePreference,
  STYLE_THEME_STORAGE_KEY,
  subscribeToUiCardStyleStorageChanges,
  subscribeToUiFontFamilyStorageChanges,
  subscribeToUiFontSizeStorageChanges,
  THEME_STORAGE_KEY,
} from "@zcode/ui";

declare global {
  interface Window {
    resourceManager?: {
      getSnapshot: () => Promise<ResourceUsageSnapshot>;
      setSamplingActive: (active: boolean) => void;
      storage?: StorageManagementBridge;
      network?: NetworkCaptureBridge;
    };
  }
}

// 资源管理器是独立窗口，只读主窗口写入 localStorage 的配色与 UI 方案偏好。
// 复用 useTheme 的 applyTheme，避免这里再维护一份主题取值与 class 映射。
function applyResourceManagerTheme(): void {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = isTheme(savedTheme) ? savedTheme : "zai-dark";
  applyTheme(theme, readStyleThemePreference(theme));
}

applyResourceManagerTheme();
// 主窗口切换配色或 UI 方案时，独立窗口通过 storage 事件跟随。
window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY || event.key === STYLE_THEME_STORAGE_KEY) {
    applyResourceManagerTheme();
  }
});
// 资源管理器不创建主窗口的 Zustand store，text-ui-* 无法自动获得持久化基准。
// 首屏前显式应用，运行中再由 storage 事件同步，且不改变 html font-size 或接入业务 Host。
applyUiFontSizePx(loadUiFontSizePx());
subscribeToUiFontSizeStorageChanges();
// 界面字体同理：独立窗口也要跟随主窗口写入的偏好。
const resourceManagerFontFamily = loadUiFontFamily();
applyUiFontFamily(resourceManagerFontFamily.latin, resourceManagerFontFamily.cjk);
subscribeToUiFontFamilyStorageChanges();
// 卡片样式偏好同样只读主窗口写入的 localStorage，由 storage 事件持续同步。
applyUiCardStyle(loadUiCardStyle());
subscribeToUiCardStyleStorageChanges();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    // 语言沿用主窗口写入 localStorage 的偏好；不接 settingService，避免独立窗口再起一份 RPC。
    <ZCodeIntlProvider>
      <ResourceManagerApp
        setSamplingActive={window.resourceManager?.setSamplingActive}
        getSnapshot={
          window.resourceManager ? () => window.resourceManager!.getSnapshot() : undefined
        }
        storage={window.resourceManager?.storage}
        network={window.resourceManager?.network}
      />
    </ZCodeIntlProvider>,
  );
}
