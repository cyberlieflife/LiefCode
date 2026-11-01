import { BotIcon, NetworkIcon } from "lucide-react";
import { AGENT_MODES, type AgentMode } from "@zcode/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/**
 * 会话模式切换入口。
 *
 * 与模型/权限模式并列放在输入框左侧；新建会话只改草稿，已存在会话由宿主发
 * switchAgentMode 命令——本组件不直接调用服务。
 */
export function V4ComposerAgentModeControl({
  agentMode,
  disabled,
  onSwitchAgentMode,
}: {
  agentMode: AgentMode;
  disabled?: boolean;
  onSwitchAgentMode: (agentMode: AgentMode) => void;
}) {
  const { intl } = useZCodeIntl();
  const label = intl.formatMessage({ id: "chat.toolbar.agentMode.label" });
  const isSuperAgent = agentMode === "superagent";
  const Icon = isSuperAgent ? NetworkIcon : BotIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={label}
          data-testid="chat-agent-mode-select-trigger"
          className={cn(
            "h-7 gap-1 rounded-lg px-2 text-ui-base",
            isSuperAgent && "text-icon-blue hover:text-icon-blue aria-expanded:text-icon-blue",
          )}
        >
          <Icon className="size-4" />
          <span>
            {intl.formatMessage({
              id: isSuperAgent
                ? "chat.toolbar.agentMode.superagent"
                : "chat.toolbar.agentMode.agent",
            })}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        <DropdownMenuRadioGroup
          value={agentMode}
          onValueChange={(next) => {
            const mode = AGENT_MODES.find((item) => item === next);
            if (mode) onSwitchAgentMode(mode);
          }}
        >
          {AGENT_MODES.map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode} data-testid={`chat-agent-mode-item-${mode}`}>
              {intl.formatMessage({ id: `chat.toolbar.agentMode.${mode}` })}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
