import { useEffect, useState } from "react";
import { AGENT_MODES, type AgentMode, type AppSettings } from "@zcode/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { toast } from "@/components/ui/toast.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { SettingsRow } from "@/settings/SettingsPageParts.js";
import { SuperAgentGuide } from "@/superagent/SuperAgentGuide.js";

/** 设置只决定新建会话的初值；已存在会话的模式由会话自己持久化。 */
export function DefaultSessionModeSetting() {
  const { intl } = useZCodeIntl();
  const { settings, update } = useSettings();
  const settledValue: AgentMode = settings?.defaultSessionMode ?? "agent";
  const [pending, setPending] = useState<AgentMode | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (pending !== null && settledValue === pending) setPending(null);
  }, [pending, settledValue]);

  const value = pending ?? settledValue;
  const label = intl.formatMessage({ id: "settings.defaultSessionMode" });

  const handleValueChange = async (raw: string) => {
    const next = AGENT_MODES.find((mode) => mode === raw);
    if (!next || next === value) return;
    setPending(next);
    try {
      await update({ defaultSessionMode: next } satisfies Pick<
        AppSettings,
        "defaultSessionMode"
      >);
    } catch (error) {
      setPending(null);
      logger.warn("[settings] 保存默认会话模式失败", { error: String(error) });
      toast(intl.formatMessage({ id: "settings.defaultSessionMode.saveError" }));
    }
  };

  return (
    <>
      <SettingsRow
      label={label}
      description={intl.formatMessage({ id: "settings.defaultSessionModeDescription" })}
      controlLayout="wide"
      control={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-ui-xs text-foreground-subtle hover:text-foreground"
            data-testid="superagent-guide-open"
          >
            {intl.formatMessage({ id: "settings.defaultSessionMode.guide" })}
          </button>
          <Select value={value} onValueChange={(next) => void handleValueChange(next)}>
            <SelectTrigger size="lg" className="w-[220px] min-w-0 justify-between" aria-label={label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end" sideOffset={4}>
              {AGENT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {intl.formatMessage({ id: `settings.defaultSessionMode.option.${mode}` })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      />
      {guideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={intl.formatMessage({ id: "settings.defaultSessionMode.guide" })}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-md px-2 py-1 text-ui-xs text-foreground-subtle hover:text-foreground"
              >
                {intl.formatMessage({ id: "settings.defaultSessionMode.guideClose" })}
              </button>
            </div>
            <SuperAgentGuide />
          </div>
        </div>
      ) : null}
    </>
  );
}
