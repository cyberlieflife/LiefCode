import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import {
  getUiFontCjkStack,
  getUiFontLatinStack,
  UI_FONT_CJK_OPTION_ORDER,
  UI_FONT_LATIN_OPTION_ORDER,
  type UiFontFamilyCjk,
  type UiFontFamilyLatin,
} from "@/lib/uiFontFamily.js";

/** 卡片内预览文案：英文组只展示西文，中文组只展示汉字，避免用错栈掩盖真实差异。 */
const LATIN_PREVIEW_TEXT = "LiefCode Interface 0123";
const CJK_PREVIEW_TEXT = "界面字体预览效果";

function UiFontOptionCard({
  label,
  fontFamily,
  previewText,
  isSelected,
  onSelect,
}: {
  label: string;
  fontFamily: string;
  previewText: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors",
        isSelected
          ? "border-primary bg-selected"
          : "border-border bg-card hover:bg-surface-hover",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-ui-base font-medium text-foreground">{label}</span>
        {isSelected ? (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-primary"
          />
        ) : null}
      </span>
      <span
        className="truncate text-ui-lg leading-7 text-foreground-subtle"
        style={{ fontFamily }}
      >
        {previewText}
      </span>
    </button>
  );
}

function UiFontFamilyGroup<T extends string>({
  title,
  description,
  labelIdPrefix,
  options,
  value,
  previewText,
  resolveFontFamily,
  onChange,
}: {
  title: string;
  description: string;
  labelIdPrefix: string;
  options: readonly T[];
  value: T;
  previewText: string;
  resolveFontFamily: (value: T) => string;
  onChange: (value: T) => void;
}) {
  const { intl } = useZCodeIntl();

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h3 className="text-ui-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <UiFontOptionCard
            key={option}
            label={intl.formatMessage({
              id: `settings.uiFontFamily.option.${labelIdPrefix}.${option}`,
            })}
            fontFamily={resolveFontFamily(option)}
            previewText={previewText}
            isSelected={option === value}
            onSelect={() => onChange(option)}
          />
        ))}
      </div>
    </div>
  );
}

export function UiFontFamilySetting({
  uiFontFamilyLatin,
  uiFontFamilyCjk,
  onUiFontFamilyLatinChange,
  onUiFontFamilyCjkChange,
}: {
  uiFontFamilyLatin: UiFontFamilyLatin;
  uiFontFamilyCjk: UiFontFamilyCjk;
  onUiFontFamilyLatinChange: (value: UiFontFamilyLatin) => void;
  onUiFontFamilyCjkChange: (value: UiFontFamilyCjk) => void;
}) {
  const { intl } = useZCodeIntl();

  return (
    <div className="space-y-6">
      <UiFontFamilyGroup
        title={intl.formatMessage({ id: "settings.uiFontFamily.latinTitle" })}
        description={intl.formatMessage({ id: "settings.uiFontFamily.latinDescription" })}
        labelIdPrefix="latin"
        options={UI_FONT_LATIN_OPTION_ORDER}
        value={uiFontFamilyLatin}
        previewText={LATIN_PREVIEW_TEXT}
        resolveFontFamily={getUiFontLatinStack}
        onChange={onUiFontFamilyLatinChange}
      />
      <UiFontFamilyGroup
        title={intl.formatMessage({ id: "settings.uiFontFamily.cjkTitle" })}
        description={intl.formatMessage({ id: "settings.uiFontFamily.cjkDescription" })}
        labelIdPrefix="cjk"
        options={UI_FONT_CJK_OPTION_ORDER}
        value={uiFontFamilyCjk}
        previewText={CJK_PREVIEW_TEXT}
        resolveFontFamily={getUiFontCjkStack}
        onChange={onUiFontFamilyCjkChange}
      />
    </div>
  );
}
