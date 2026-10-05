import { createRoot } from "react-dom/client";
import type { ResourceUsageSnapshot, StorageManagementBridge } from "@zcode/shared";
import "@zcode/ui/styles.css";
import {
  ResourceManagerApp,
  ZCodeIntlProvider,
  applyTheme,
  applyUiFontSizePx,
  isTheme,
  loadUiFontSizePx,
  subscribeToUiFontSizeStorageChanges,
} from "@zcode/ui";

declare global {
  interface Window {
    resourceManager?: {
      getSnapshot: () => Promise<ResourceUsageSnapshot>;
      setSamplingActive: (active: boolean) => void;
      storage?: StorageManagementBridge;
    };
  }
}

// 资源管理器是独立窗口，只读主窗口写入 localStorage 的主题偏好。
// 复用 useTheme 的 applyTheme，避免这里再维护一份主题取值与 class 映射。
function applyResourceManagerTheme(): void {
  const savedTheme = localStorage.getItem("zcode-theme");
  applyTheme(isTheme(savedTheme) ? savedTheme : "zai-dark");
}

applyResourceManagerTheme();
// 资源管理器不创建主窗口的 Zustand store，text-ui-* 无法自动获得持久化基准。
// 首屏前显式应用，运行中再由 storage 事件同步，且不改变 html font-size 或接入业务 Host。
applyUiFontSizePx(loadUiFontSizePx());
subscribeToUiFontSizeStorageChanges();

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
      />
    </ZCodeIntlProvider>,
  );
}
