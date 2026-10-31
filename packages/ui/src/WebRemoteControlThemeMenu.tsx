import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { getCodexUiTheme } from "@/lib/codexThemes.js";
import { THEME_MODES } from "@/settings/settingsPageConfig.js";
import type { Theme } from "@/useTheme.js";

// 手机端只提供配色方案；UI 方案沿用桌面同步值，避免移动端菜单过长。
const MOBILE_THEME_OPTIONS: Theme[] = THEME_MODES.map(({ mode }) => mode);

export function WebRemoteControlThemeMenu() {
  const { intl } = useZCodeIntl();
  const theme = useZCodeStore((state) => state.theme);
  const setTheme = useZCodeStore((state) => state.setTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={intl.formatMessage({ id: "webRemoteControl.themeMenu.trigger" })}
        >
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (MOBILE_THEME_OPTIONS.includes(value as Theme)) {
              setTheme(value as Theme);
            }
          }}
        >
          {MOBILE_THEME_OPTIONS.map((option) => {
            const codexTheme = getCodexUiTheme(option);
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                {option === "system"
                  ? intl.formatMessage({ id: "sidebar.settings.systemDefault" })
                  : (codexTheme?.label ??
                    intl.formatMessage({ id: `sidebar.settings.theme.${option}` }))}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
