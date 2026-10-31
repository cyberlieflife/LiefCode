import type { StyleTheme, Theme } from "@/useTheme.js";
import { useState } from "react";
import { resolveTheme } from "@/useTheme.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { Switch } from "@/components/ui/switch.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  getThemeOptionLabel,
  SettingsRow,
  ThemePreviewCard,
  ThemeSelect,
} from "@/settings/SettingsPageParts.js";
import { getCodePreviewTheme } from "@/lib/codePreviewPreferences.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { CodePreviewSettings } from "@/store/index.js";
import { STYLE_THEMES, THEME_MODE_GROUPS, THEME_MODES } from "@/settings/settingsPageConfig.js";
import { getCodexUiTheme } from "@/lib/codexThemes.js";
import { MAX_UI_FONT_SIZE_PX, MIN_UI_FONT_SIZE_PX } from "@/lib/uiFontSize.js";
import { UiFontFamilySetting } from "@/settings/UiFontFamilySetting.js";
import type { UiFontFamilyCjk, UiFontFamilyLatin } from "@/lib/uiFontFamily.js";
import { UiCardStyleSetting } from "@/settings/UiCardStyleSetting.js";
import { PetSettingsSection } from "@/pet/index.js";
import type { UiCardStyle, UiCardStyleConfig, UiCardStyleSurface } from "@/lib/uiCardStyle.js";

function FontSizeInput({
  value,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    const nextValue = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, Math.round(parsed)))
      : value;
    setDraft(String(nextValue));
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  return (
    <div className="relative w-28">
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(value));
          }
        }}
        className="pr-8 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-ui-lg text-foreground-subtle">
        px
      </span>
    </div>
  );
}

export function AppearanceSectionContent({
  codePreviewSettings,
  setCodePreviewSettings,
  theme,
  setTheme,
  styleTheme,
  setStyleTheme,
  uiFontSizePx,
  setUiFontSizePx,
  uiFontFamilyLatin,
  setUiFontFamilyLatin,
  uiFontFamilyCjk,
  setUiFontFamilyCjk,
  uiCardStyle,
  onChangeUiCardStyle,
}: {
  codePreviewSettings: CodePreviewSettings;
  setCodePreviewSettings: (settings: Partial<CodePreviewSettings>) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  styleTheme: StyleTheme;
  setStyleTheme: (styleTheme: StyleTheme) => void;
  uiFontSizePx: number;
  setUiFontSizePx: (fontSizePx: number) => void;
  uiFontFamilyLatin: UiFontFamilyLatin;
  setUiFontFamilyLatin: (family: UiFontFamilyLatin) => void;
  uiFontFamilyCjk: UiFontFamilyCjk;
  setUiFontFamilyCjk: (family: UiFontFamilyCjk) => void;
  uiCardStyle: UiCardStyleConfig;
  onChangeUiCardStyle: (surface: UiCardStyleSurface, style: UiCardStyle) => void;
}) {
  const { intl } = useZCodeIntl();
  const activePreviewMode = resolveTheme(theme);
  const renderThemeModeItem = ({ mode, icon: Icon }: (typeof THEME_MODES)[number]) => {
    // Codex 主题名是产品专有名词，直接展示；Zai / Claude 继续使用本地化文案。
    const codexTheme = getCodexUiTheme(mode);
    return (
      <SelectItem key={mode} value={mode}>
        <div className="flex items-center gap-2">
          <Icon className="size-4" />
          {codexTheme?.label ??
            intl.formatMessage({
              id: `settings.themeMode.${mode}`,
            })}
        </div>
      </SelectItem>
    );
  };

  return (
    <>
      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="text-ui-lg font-semibold text-foreground">
            {intl.formatMessage({ id: "settings.appearance.interfaceTitle" })}
          </h3>
          <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
            {intl.formatMessage({
              id: "settings.appearance.interfaceDescription",
            })}
          </p>
        </div>
        <Card className="border border-border bg-card py-0 shadow-none">
          <CardContent className="space-y-0 px-0">
            <SettingsRow
              label={intl.formatMessage({ id: "settings.colorScheme" })}
              description={intl.formatMessage({
                id: "settings.colorSchemeDescription",
              })}
              control={
                <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                  <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        {intl.formatMessage({ id: "settings.themeMode.groupSystem" })}
                      </SelectLabel>
                      {THEME_MODES.filter(({ mode }) => mode === "system").map(
                        renderThemeModeItem,
                      )}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>
                        {intl.formatMessage({ id: "settings.themeMode.groupDark" })}
                      </SelectLabel>
                      {THEME_MODE_GROUPS.dark.map(renderThemeModeItem)}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>
                        {intl.formatMessage({ id: "settings.themeMode.groupLight" })}
                      </SelectLabel>
                      {THEME_MODE_GROUPS.light.map(renderThemeModeItem)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              }
            />
            <SettingsRow
              label={intl.formatMessage({ id: "settings.uiScheme" })}
              description={intl.formatMessage({
                id: "settings.uiSchemeDescription",
              })}
              control={
                <Select
                  value={styleTheme}
                  onValueChange={(value) => setStyleTheme(value as StyleTheme)}
                >
                  <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLE_THEMES.map(({ style, icon: Icon }) => (
                      <SelectItem key={style} value={style}>
                        <div className="flex items-center gap-2">
                          <Icon className="size-4" />
                          {intl.formatMessage({
                            id: `settings.uiScheme.${style}`,
                          })}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <SettingsRow
              label={intl.formatMessage({ id: "settings.uiFontSize" })}
              description={intl.formatMessage({
                id: "settings.uiFontSizeDescription",
              })}
              control={
                <FontSizeInput
                  key={uiFontSizePx}
                  min={MIN_UI_FONT_SIZE_PX}
                  max={MAX_UI_FONT_SIZE_PX}
                  value={uiFontSizePx}
                  onChange={setUiFontSizePx}
                  ariaLabel={intl.formatMessage({ id: "settings.uiFontSize" })}
                />
              }
            />
          </CardContent>
        </Card>

        <UiFontFamilySetting
          uiFontFamilyLatin={uiFontFamilyLatin}
          uiFontFamilyCjk={uiFontFamilyCjk}
          onUiFontFamilyLatinChange={setUiFontFamilyLatin}
          onUiFontFamilyCjkChange={setUiFontFamilyCjk}
        />

        <UiCardStyleSetting config={uiCardStyle} onChange={onChangeUiCardStyle} />

        <PetSettingsSection />
      </div>

      <div className="space-y-6">
        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-ui-lg font-semibold text-foreground">
              {intl.formatMessage({ id: "settings.appearance.codeTitle" })}
            </h3>
            <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
              {intl.formatMessage({
                id: "settings.appearance.codeDescription",
              })}
            </p>
          </div>
          <Card className="border border-border bg-card py-0 shadow-none [&_[data-slot=select-trigger]]:w-full">
            <CardContent className="space-y-0 px-0">
              <SettingsRow
                label={intl.formatMessage({ id: "settings.lightTheme" })}
                description={intl.formatMessage({
                  id: "settings.lightThemeDescription",
                })}
                control={
                  <ThemeSelect
                    value={codePreviewSettings.lightTheme}
                    onValueChange={(value) => setCodePreviewSettings({ lightTheme: value })}
                  />
                }
              />
              <SettingsRow
                label={intl.formatMessage({ id: "settings.darkTheme" })}
                description={intl.formatMessage({
                  id: "settings.darkThemeDescription",
                })}
                control={
                  <ThemeSelect
                    value={codePreviewSettings.darkTheme}
                    onValueChange={(value) => setCodePreviewSettings({ darkTheme: value })}
                  />
                }
              />
              <SettingsRow
                label={intl.formatMessage({ id: "settings.showLineNumbers" })}
                description={intl.formatMessage({
                  id: "settings.showLineNumbersDescription",
                })}
                control={
                  <Switch
                    checked={codePreviewSettings.showLineNumbers}
                    onCheckedChange={(checked) =>
                      setCodePreviewSettings({ showLineNumbers: checked })
                    }
                  />
                }
              />
              <SettingsRow
                label={intl.formatMessage({ id: "settings.wrapLongLines" })}
                description={intl.formatMessage({
                  id: "settings.wrapLongLinesDescription",
                })}
                control={
                  <Switch
                    checked={codePreviewSettings.wrapLongLines}
                    onCheckedChange={(checked) =>
                      setCodePreviewSettings({ wrapLongLines: checked })
                    }
                  />
                }
              />
              <SettingsRow
                label={intl.formatMessage({ id: "settings.fontSize" })}
                description={intl.formatMessage({
                  id: "settings.fontSizeDescription",
                })}
                control={
                  <FontSizeInput
                    key={codePreviewSettings.fontSizePx}
                    min={12}
                    max={20}
                    value={codePreviewSettings.fontSizePx}
                    onChange={(fontSizePx) => setCodePreviewSettings({ fontSizePx })}
                    ariaLabel={intl.formatMessage({ id: "settings.fontSize" })}
                  />
                }
              />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="text-ui-base font-semibold text-foreground">
              {intl.formatMessage({ id: "settings.previewSectionTitle" })}
            </h3>
            <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
              {intl.formatMessage({ id: "settings.previewDescription" })}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ThemePreviewCard
              mode="light"
              title={intl.formatMessage({ id: "settings.previewLight" })}
              themeName={getThemeOptionLabel(codePreviewSettings.lightTheme)}
              theme={getCodePreviewTheme("light", codePreviewSettings)}
              isActive={activePreviewMode === "light"}
              showLineNumbers={codePreviewSettings.showLineNumbers}
              wrapLongLines={codePreviewSettings.wrapLongLines}
              fontSizePx={codePreviewSettings.fontSizePx}
            />
            <ThemePreviewCard
              mode="dark"
              title={intl.formatMessage({ id: "settings.previewDark" })}
              themeName={getThemeOptionLabel(codePreviewSettings.darkTheme)}
              theme={getCodePreviewTheme("dark", codePreviewSettings)}
              isActive={activePreviewMode === "dark"}
              showLineNumbers={codePreviewSettings.showLineNumbers}
              wrapLongLines={codePreviewSettings.wrapLongLines}
              fontSizePx={codePreviewSettings.fontSizePx}
            />
          </div>
        </div>
      </div>
    </>
  );
}
