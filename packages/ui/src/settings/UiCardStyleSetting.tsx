/**
 * 卡片样式设置：侧边栏、大卡片、小卡片、面板、背景五个区域各自选择质感样式。
 * 顶部用一块迷你工作台实时预览当前组合；预览元素与真实表面共用同一组 CSS 规则。
 */
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Card } from "@/components/ui/card.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  UI_CARD_STYLE_OPTION_ORDER,
  UI_CARD_STYLE_SURFACES,
  type UiCardStyle,
  type UiCardStyleConfig,
  type UiCardStyleSurface,
} from "@/lib/uiCardStyle.js";
import { SettingsRow } from "@/settings/SettingsPageParts.js";

const SURFACE_TITLE_ID: Record<UiCardStyleSurface, string> = {
  sidebar: "settings.uiCardStyle.surface.sidebar",
  cardLarge: "settings.uiCardStyle.surface.cardLarge",
  cardSmall: "settings.uiCardStyle.surface.cardSmall",
  panel: "settings.uiCardStyle.surface.panel",
  background: "settings.uiCardStyle.surface.background",
};

const SURFACE_DESCRIPTION_ID: Record<UiCardStyleSurface, string> = {
  sidebar: "settings.uiCardStyle.surface.sidebarDescription",
  cardLarge: "settings.uiCardStyle.surface.cardLargeDescription",
  cardSmall: "settings.uiCardStyle.surface.cardSmallDescription",
  panel: "settings.uiCardStyle.surface.panelDescription",
  background: "settings.uiCardStyle.surface.backgroundDescription",
};

function UiCardStylePreview({ config }: { config: UiCardStyleConfig }) {
  return (
    // 预览外壳对应"背景"区域：氛围光斑与半透明底层画在这里。
    <div
      data-ucs-preview="background"
      data-card-style-background={config.background}
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex h-44">
        <div
          data-ucs-preview="sidebar"
          data-card-style-sidebar={config.sidebar}
          className="w-24 shrink-0 border-r border-border p-2.5"
        >
          <div className="space-y-1.5">
            <div className="h-2 w-12 rounded-full bg-foreground/25" />
            <div className="h-5 rounded-md bg-foreground/10" />
            <div className="h-5 rounded-md bg-foreground/10" />
            <div className="h-5 rounded-md bg-foreground/10" />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5 bg-background p-3">
          <Card
            data-ucs-preview="cardLarge"
            data-card-style-card-large={config.cardLarge}
            className="gap-2 py-3"
          >
            <div className="h-2 w-20 rounded-full bg-foreground/30" />
            <div className="h-2 w-32 rounded-full bg-foreground/10" />
          </Card>
          <div className="flex gap-2.5">
            <Card
              data-size="sm"
              data-ucs-preview="cardSmall"
              data-card-style-card-small={config.cardSmall}
              className="min-w-0 flex-1 gap-2 py-2.5"
            >
              <div className="h-2 w-14 rounded-full bg-foreground/20" />
            </Card>
            <div
              data-ucs-preview="panel"
              data-card-style-panel={config.panel}
              className="min-w-0 flex-1 rounded-lg border border-border bg-panel p-2.5"
            >
              <div className="h-2 w-16 rounded-full bg-foreground/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UiCardStyleSetting({
  config,
  onChange,
}: {
  config: UiCardStyleConfig;
  onChange: (surface: UiCardStyleSurface, style: UiCardStyle) => void;
}) {
  const { intl } = useZCodeIntl();

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h3 className="text-ui-lg font-semibold text-foreground">
          {intl.formatMessage({ id: "settings.uiCardStyle.title" })}
        </h3>
        <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
          {intl.formatMessage({ id: "settings.uiCardStyle.description" })}
        </p>
      </div>
      <UiCardStylePreview config={config} />
      <Card className="border border-border bg-card py-0 shadow-none">
        {UI_CARD_STYLE_SURFACES.map((surface) => (
          <SettingsRow
            key={surface}
            label={intl.formatMessage({ id: SURFACE_TITLE_ID[surface] })}
            description={intl.formatMessage({ id: SURFACE_DESCRIPTION_ID[surface] })}
            control={
              <Select
                value={config[surface]}
                onValueChange={(value) => onChange(surface, value as UiCardStyle)}
              >
                <SelectTrigger size="lg" className="w-[200px] min-w-0 justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UI_CARD_STYLE_OPTION_ORDER.map((style) => (
                    <SelectItem key={style} value={style}>
                      {intl.formatMessage({ id: `settings.uiCardStyle.style.${style}` })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        ))}
      </Card>
    </div>
  );
}
