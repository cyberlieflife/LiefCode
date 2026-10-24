import type { UserInfo } from "@zcode/shared";
import { Blocks, CalendarClock, ChevronDown, Home, Search, Settings, User } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

interface CodexSidebarRailProps {
  onCreateTask: () => void;
  onOpenAutomations?: () => void;
  automationsActive?: boolean;
  onOpenPluginStore?: () => void;
  pluginStoreActive?: boolean;
  onOpenSettings: () => void;
  onOpenCommandCenter?: () => void;
  user?: UserInfo | null;
  onLogin?: () => void;
}

/** Codex 方案左侧图标栏：只保留高频入口，文字列表留在右侧栏。 */
export function CodexSidebarRail({
  onCreateTask,
  onOpenAutomations,
  automationsActive,
  onOpenPluginStore,
  pluginStoreActive,
  onOpenSettings,
  onOpenCommandCenter,
  user,
  onLogin,
}: CodexSidebarRailProps) {
  const { intl } = useZCodeIntl();
  const userInitial =
    user?.displayName?.trim()?.[0]?.toUpperCase() ?? user?.username?.trim()?.[0]?.toUpperCase();

  return (
    <nav
      data-codex-sidebar-rail="true"
      aria-label={intl.formatMessage({ id: "settings.title" })}
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border/60 py-3 [app-region:no-drag]"
    >
      <RailButton label={intl.formatMessage({ id: "sidebar.newTask" })} onClick={onCreateTask}>
        <Home className="size-4" />
      </RailButton>
      {onOpenAutomations ? (
        <RailButton
          label={intl.formatMessage({ id: "workspace.openScheduledSettings" })}
          active={automationsActive}
          onClick={() => onOpenAutomations()}
        >
          <CalendarClock className="size-4" />
        </RailButton>
      ) : null}
      {onOpenPluginStore ? (
        <RailButton
          label={intl.formatMessage({ id: "workspace.openPluginsSettings" })}
          active={pluginStoreActive}
          onClick={() => onOpenPluginStore()}
        >
          <Blocks className="size-4" />
        </RailButton>
      ) : null}
      {onOpenCommandCenter ? (
        <RailButton
          label={intl.formatMessage({ id: "sidebar.codexRail.search" })}
          onClick={() => onOpenCommandCenter()}
        >
          <Search className="size-4" />
        </RailButton>
      ) : null}

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton label={intl.formatMessage({ id: "settings.title" })} onClick={onOpenSettings}>
          <Settings className="size-4" />
        </RailButton>
        <RailButton
          label={user ? (user.displayName ?? user.username) : intl.formatMessage({ id: "welcome.login" })}
          onClick={user ? onOpenSettings : onLogin}
        >
          {userInitial ? (
            <span className="flex size-7 items-center justify-center rounded-full bg-brand text-ui-sm font-semibold text-primary-foreground">
              {userInitial}
            </span>
          ) : (
            <User className="size-4" />
          )}
        </RailButton>
      </div>
    </nav>
  );
}

function RailButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg text-foreground-subtle transition-colors [app-region:no-drag]",
        "hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused",
        active && "bg-selected text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Codex 右侧栏顶部品牌行：标题 + 下拉指示 + 搜索入口。 */
export function CodexSidebarHeader({
  onSearch,
}: {
  onSearch?: () => void;
}) {
  const { intl } = useZCodeIntl();
  return (
    <>
      <span className="min-w-0 truncate text-ui-lg font-semibold text-foreground">LiefCode</span>
      <ChevronDown className="size-4 shrink-0 text-foreground-subtle" />
      {onSearch ? (
        <button
          type="button"
          aria-label={intl.formatMessage({ id: "sidebar.codexRail.search" })}
          onClick={onSearch}
          className="ml-auto flex size-7 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground [app-region:no-drag]"
        >
          <Search className="size-4" />
        </button>
      ) : null}
    </>
  );
}
