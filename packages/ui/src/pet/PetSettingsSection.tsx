import { useEffect, useMemo, useState } from "react";
import { PawPrint, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { Switch } from "@/components/ui/switch.js";
import { cn } from "@/components/lib/utils.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsRangeControl, SettingsRow } from "@/settings/SettingsPageParts.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { resolveTheme } from "@/useTheme.js";
import {
  PET_DEFAULT_PET_ID,
  PET_DISABLED_ID,
  type PetDefinition,
} from "./contract.js";
import { toPetDesktopPet } from "./desktopPetPayload.js";
import { buildPetDesktopLabels } from "./petNotificationText.js";
import { PetSprite } from "./PetSprite.js";
import { usePetImageStatus } from "./petImage.js";
import { PET_SIZE_MAX_PX, PET_SIZE_MIN_PX } from "./storeSlice.js";
import { usePetCatalog } from "./usePetCatalog.js";

function PetSourceLabel({ source }: { source: string }) {
  const { intl } = useZCodeIntl();
  const id = source === "builtin" ? "settings.pet.source.builtin" : "settings.pet.source.codexHome";
  return <>{intl.formatMessage({ id })}</>;
}

function PetCard({
  pet,
  selected,
  onSelect,
}: {
  pet: PetDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const { intl } = useZCodeIntl();
  const imageStatus = usePetImageStatus(pet.spritesheetUrl);
  const idleFrame = pet.animations.idle?.frames[0]?.spriteIndex ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`pet-card-${pet.id}`}
      className={cn(
        "flex min-h-[128px] items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
        selected
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:bg-hover",
      )}
    >
      <span className="grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-lg bg-surface">
        {imageStatus === "ready" ? (
          <PetSprite pet={pet} spriteIndex={idleFrame} heightPx={64} />
        ) : (
          <PawPrint className="size-6 text-foreground-subtle" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-base font-medium text-foreground">
          {pet.displayName}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-ui-xs leading-4 text-foreground-subtle">
          {pet.description || <PetSourceLabel source={pet.source} />}
        </span>
        {imageStatus === "error" ? (
          <span className="mt-1 block text-ui-xs text-warning">
            {intl.formatMessage({ id: "settings.pet.unavailable" })}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function DisabledPetCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const { intl } = useZCodeIntl();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="pet-card-disabled"
      className={cn(
        "flex min-h-[128px] items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:bg-hover",
      )}
    >
      <span className="grid size-[72px] shrink-0 place-items-center rounded-lg bg-surface">
        <PawPrint className="size-6 text-foreground-subtle" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "settings.pet.disabled" })}
        </span>
        <span className="mt-0.5 block text-ui-xs leading-4 text-foreground-subtle">
          {intl.formatMessage({ id: "settings.pet.disabledDescription" })}
        </span>
      </span>
    </button>
  );
}

/**
 * 外观设置里的宠物面板：选择、动画开关、桌面常驻与 Codex 目录刷新。
 * 选择结果写入全局 store，主进程的独立宠物窗口与所有窗口同步更新。
 */
export function PetSettingsSection() {
  const { intl } = useZCodeIntl();
  const platform = useOptionalPlatform();
  const petId = useZCodeStore((state) => state.petId);
  const petAnimationsEnabled = useZCodeStore((state) => state.petAnimationsEnabled);
  const petDesktopEnabled = useZCodeStore((state) => state.petDesktopEnabled);
  const petSizePx = useZCodeStore((state) => state.petSizePx);
  const theme = useZCodeStore((state) => state.theme);
  const setPetId = useZCodeStore((state) => state.setPetId);
  const setPetAnimationsEnabled = useZCodeStore((state) => state.setPetAnimationsEnabled);
  const setPetDesktopEnabled = useZCodeStore((state) => state.setPetDesktopEnabled);
  const setPetSizePx = useZCodeStore((state) => state.setPetSizePx);
  const { pets, loading, error, reload } = usePetCatalog();
  const [query, setQuery] = useState("");

  const enabled = petId !== PET_DISABLED_ID;
  const selectedPet = pets.find((pet) => pet.id === petId) ?? null;
  const filteredPets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pets;
    return pets.filter((pet) =>
      `${pet.displayName} ${pet.description} ${pet.id}`.toLowerCase().includes(needle),
    );
  }, [pets, query]);
  const customPetCount = pets.filter((pet) => pet.source === "codex-home").length;

  // 设置页可能先于会话挂载；这里直接同步选择结果，保证独立宠物窗口即时跟随。
  useEffect(() => {
    platform?.updatePetDesktopPet?.(toPetDesktopPet(selectedPet));
  }, [platform, selectedPet]);

  useEffect(() => {
    platform?.updatePetDesktopStatus?.({
      enabled,
      desktopEnabled: petDesktopEnabled,
      animationsEnabled: petAnimationsEnabled,
      theme: resolveTheme(theme),
      petSizePx,
      labels: buildPetDesktopLabels(intl),
      tasks: [],
    });
  }, [enabled, intl, petAnimationsEnabled, petDesktopEnabled, petSizePx, platform, theme]);

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h3 className="text-ui-lg font-semibold text-foreground">
          {intl.formatMessage({ id: "settings.pet.title" })}
        </h3>
        <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
          {intl.formatMessage({ id: "settings.pet.description" })}
        </p>
      </div>

      <Card className="border border-border bg-card py-0 shadow-none">
        <CardContent className="space-y-0 px-0">
          <SettingsRow
            label={intl.formatMessage({ id: "settings.pet.enable" })}
            description={intl.formatMessage({ id: "settings.pet.enableDescription" })}
            control={
              <Switch
                checked={enabled}
                onCheckedChange={(checked) =>
                  setPetId(checked ? PET_DEFAULT_PET_ID : PET_DISABLED_ID)
                }
              />
            }
          />
          <SettingsRow
            label={intl.formatMessage({ id: "settings.pet.animations" })}
            description={intl.formatMessage({ id: "settings.pet.animationsDescription" })}
            control={
              <Switch
                checked={petAnimationsEnabled}
                disabled={!enabled}
                onCheckedChange={setPetAnimationsEnabled}
              />
            }
          />
          <SettingsRow
            label={intl.formatMessage({ id: "settings.pet.size" })}
            description={intl.formatMessage({ id: "settings.pet.sizeDescription" })}
            control={
              <SettingsRangeControl
                value={petSizePx}
                min={PET_SIZE_MIN_PX}
                max={PET_SIZE_MAX_PX}
                step={8}
                onChange={setPetSizePx}
                valueLabel={`${petSizePx}px`}
              />
            }
          />
          <SettingsRow
            label={intl.formatMessage({ id: "settings.pet.desktop" })}
            description={intl.formatMessage({ id: "settings.pet.desktopDescription" })}
            control={
              <Switch
                checked={petDesktopEnabled}
                disabled={!enabled}
                onCheckedChange={setPetDesktopEnabled}
              />
            }
          />
          <SettingsRow
            label={intl.formatMessage({ id: "settings.pet.resetPosition" })}
            description={intl.formatMessage({
              id: "settings.pet.resetPositionDescription",
            })}
            control={
              <button
                type="button"
                disabled={!enabled || !platform?.resetPetDesktopPosition}
                onClick={() => platform?.resetPetDesktopPosition?.()}
                className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-ui-xs font-medium text-foreground-subtle transition-colors hover:bg-hover disabled:opacity-50"
              >
                {intl.formatMessage({ id: "settings.pet.resetPositionAction" })}
              </button>
            }
          />
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-ui-base font-semibold text-foreground">
              {intl.formatMessage({ id: "settings.pet.pickerTitle" })}
            </h4>
            <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
              {intl.formatMessage({ id: "settings.pet.pickerDescription" })}
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-ui-xs font-medium text-foreground-subtle transition-colors hover:bg-hover disabled:opacity-50"
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              aria-hidden="true"
            />
            {intl.formatMessage({ id: "settings.pet.refresh" })}
          </button>
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={intl.formatMessage({ id: "settings.pet.searchPlaceholder" })}
          aria-label={intl.formatMessage({ id: "settings.pet.searchPlaceholder" })}
        />

        {error ? (
          <p role="alert" className="text-ui-xs text-warning">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DisabledPetCard
            selected={petId === PET_DISABLED_ID}
            onSelect={() => setPetId(PET_DISABLED_ID)}
          />
          {filteredPets.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              selected={pet.id === petId}
              onSelect={() => setPetId(pet.id)}
            />
          ))}
        </div>

        {loading ? (
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "settings.pet.loading" })}
          </p>
        ) : null}
        {!loading && customPetCount === 0 ? (
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "settings.pet.empty" })}
          </p>
        ) : null}
        <p className="text-ui-xs leading-5 text-foreground-subtle">
          {intl.formatMessage({ id: "settings.pet.directories" })}
        </p>
      </div>
    </div>
  );
}
