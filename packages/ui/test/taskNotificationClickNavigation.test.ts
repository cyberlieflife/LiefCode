// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRootPlatformEffects } from "@/root/useRootPlatformEffects.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";

const { findScope } = vi.hoisted(() => ({ findScope: vi.fn() }));

vi.mock("@/v4/sessionsIndexRegistry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/v4/sessionsIndexRegistry.js")>()),
  findSessionsIndexScopeBySessionId: findScope,
}));
vi.mock("@/hooks/useWorkspaceServices.js", () => ({
  useOptionalBaseWorkspaceServices: () => null,
}));
vi.mock("@/store/TabStoreProvider.js", () => ({
  useTabStore: (selector: (value: unknown) => unknown) => selector({ tabs: [], activeTabId: null }),
}));
vi.mock("@/lib/rendererNavigation.js", () => ({ isRendererReloadNavigation: () => false }));

let notificationHandler: ((taskId: string) => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  notificationHandler = null;
  findScope.mockReset();
  useZCodeSessionStore.setState({ workspaces: {} });
});

afterEach(cleanup);

function mount(
  overrides: { activateTabByPath?: () => boolean; tabs?: unknown[] } = {},
) {
  const addTab = vi.fn();
  const activateTabByPath = vi.fn(overrides.activateTabByPath ?? (() => true));
  const subscribe = () => () => {};
  const platform = {
    onFocusTab: subscribe,
    onNewTab: subscribe,
    onNewTask: subscribe,
    onOpenWorkspace: subscribe,
    onTaskNotificationClick: (handler: (taskId: string) => void) => {
      notificationHandler = handler;
      return () => {};
    },
    syncWindowTabs: vi.fn(),
    syncWindowUnreadCount: vi.fn(),
    syncActiveTaskSession: vi.fn(),
    setApplicationLocale: vi.fn(async () => {}),
  };
  renderHook(() =>
    useRootPlatformEffects({
      canBootstrapInitialWorkspace: false,
      addTab,
      setIsBootstrappingInitialWorkspace: vi.fn(),
      platform: platform as never,
      activateTabByPath,
      startDraftInWorkspace: vi.fn(),
      startNewTaskFromActiveWorkspace: vi.fn(),
      openWorkspace: vi.fn(),
      openWorkspacePath: vi.fn(),
      setWorkspaceActionError: vi.fn(),
      isDesktop: false,
      locale: "en-US",
      tabs: (overrides.tabs ?? []) as never,
      intl: { formatMessage: ({ id }: { id: string }) => id } as never,
      isRestoringOAuthSession: false,
    }),
  );
  return { addTab, activateTabByPath };
}

describe("task notification click navigation", () => {
  it("按 sessions-index 反查 workspace 并切换到目标会话", () => {
    const { addTab, activateTabByPath } = mount();
    findScope.mockReturnValue({
      workspaceKey: "remote:server:s:/proj",
      workspacePath: "/proj",
      workspaceIdentity: "remote:server:s:/proj",
    });

    notificationHandler?.("session-a");

    expect(activateTabByPath).toHaveBeenCalledWith("/proj", {
      workspaceIdentity: "remote:server:s:/proj",
    });
    expect(addTab).not.toHaveBeenCalled();
    expect(
      useZCodeSessionStore
        .getState()
        .getWorkspaceState("/proj", "remote:server:s:/proj").activeTaskId,
    ).toBe("session-a");
  });

  it("目标 workspace 没有打开 tab 时补开后再选中会话", () => {
    const { addTab, activateTabByPath } = mount({ activateTabByPath: () => false });
    findScope.mockReturnValue({ workspacePath: "/proj" });

    notificationHandler?.("session-a");

    expect(activateTabByPath).toHaveBeenCalledWith("/proj", undefined);
    expect(addTab).toHaveBeenCalledWith("/proj", undefined);
    expect(useZCodeSessionStore.getState().getWorkspaceState("/proj").activeTaskId).toBe(
      "session-a",
    );
  });

  it("sessions-index 未命中且任务已选中时，用打开的 tab 坐标", () => {
    const { activateTabByPath } = mount({
      tabs: [
        {
          id: "tab-1",
          kind: "workspace",
          workspacePath: "/proj",
          workspaceIdentity: "id-proj",
        },
      ],
    });
    findScope.mockReturnValue(null);
    useZCodeSessionStore.getState().setActiveTaskId("/proj", "session-c", "id-proj");

    notificationHandler?.("session-c");

    expect(activateTabByPath).toHaveBeenCalledWith("/proj", { workspaceIdentity: "id-proj" });
  });

  it("sessions-index 未命中时退回旧 workspace 缓存", () => {
    const { activateTabByPath } = mount();
    findScope.mockReturnValue(null);
    useZCodeSessionStore.getState().setTaskListCache(
      "/legacy",
      [
        {
          taskId: "session-b",
          workspacePath: "/legacy",
          title: "legacy",
          createdAt: 1,
          updatedAt: 1,
        } as never,
      ],
    );

    notificationHandler?.("session-b");

    expect(activateTabByPath).toHaveBeenCalledWith("/legacy", undefined);
    expect(useZCodeSessionStore.getState().getWorkspaceState("/legacy").activeTaskId).toBe(
      "session-b",
    );
  });
});
