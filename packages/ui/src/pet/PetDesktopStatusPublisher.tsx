import { useEffect, useMemo, useRef, useState } from "react";

import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { resolveTheme } from "@/useTheme.js";

import { PET_DISABLED_ID, type PetSnapshot } from "./contract.js";
import { toPetDesktopPet } from "./desktopPetPayload.js";
import {
  buildPetDesktopLabels,
  buildPetTaskCardLabels,
  toPetDesktopTaskCards,
} from "./petNotificationText.js";
import { buildPetTaskCards } from "./petTaskCards.js";
import { derivePetNotificationEvent } from "./usePetNotification.js";
import { useResolvedPet } from "./usePetCatalog.js";
import { useWorkspacePetSessions } from "./useWorkspacePetSessions.js";

export interface PetDesktopStatusPublisherProps {
  snapshot: PetSnapshot | null;
  /** 只有焦点 pane 发布状态，避免分屏时多个会话争抢同一个桌面宠物窗口。 */
  focused?: boolean;
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string | null;
  /** 当前 workspace 已归档的 taskId；归档只改变组织态，sessions-index 仍保留摘要。 */
  archivedTaskIds?: ReadonlySet<string>;
}

/** 流式正文按 400ms 节流推给宠物窗口，避免每个 chunk 都走一次 IPC。 */
const PUBLISH_INTERVAL_MS = 400;

function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const latestRef = useRef(value);
  latestRef.current = value;
  const lastFlushAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = () => {
      timerRef.current = null;
      lastFlushAtRef.current = Date.now();
      setThrottled(latestRef.current);
    };
    const elapsed = Date.now() - lastFlushAtRef.current;
    if (elapsed >= intervalMs) {
      flush();
      return;
    }
    if (timerRef.current === null) {
      timerRef.current = setTimeout(flush, intervalMs - elapsed);
    }
  }, [value, intervalMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return throttled;
}

export function PetDesktopStatusPublisher({
  snapshot,
  focused = true,
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
  archivedTaskIds,
}: PetDesktopStatusPublisherProps) {
  const platform = useOptionalPlatform();
  const { intl } = useZCodeIntl();
  const petId = useZCodeStore((state) => state.petId);
  const animationsEnabled = useZCodeStore((state) => state.petAnimationsEnabled);
  const desktopEnabled = useZCodeStore((state) => state.petDesktopEnabled);
  const petSizePx = useZCodeStore((state) => state.petSizePx);
  const theme = useZCodeStore((state) => state.theme);
  const { pet } = useResolvedPet(petId);
  const resolvedTheme = resolveTheme(theme);
  const petEnabled = petId !== PET_DISABLED_ID && desktopEnabled;

  const sessionsState = useWorkspacePetSessions({
    workspacePath,
    workspaceIdentity,
    remoteSessionId,
    enabled: focused && petEnabled,
  });
  const labels = useMemo(() => buildPetTaskCardLabels(intl), [intl]);
  const statusLabels = useMemo(() => buildPetDesktopLabels(intl), [intl]);
  const focusedEvent = useMemo(() => derivePetNotificationEvent(snapshot), [snapshot]);
  const cards = useMemo(
    () =>
      buildPetTaskCards({
        sessions: sessionsState.sessions,
        focused:
          snapshot && focusedEvent
            ? {
                taskId: snapshot.sessionId,
                kind: focusedEvent.kind,
                preview: focusedEvent.body,
              }
            : null,
        labels,
        now: Date.now(),
        ...(archivedTaskIds ? { excludedTaskIds: archivedTaskIds } : {}),
      }),
    [archivedTaskIds, focusedEvent, labels, sessionsState.sessions, snapshot],
  );
  const desktopTasks = useMemo(() => toPetDesktopTaskCards(cards), [cards]);
  const publishedTasks = useThrottledValue(desktopTasks, PUBLISH_INTERVAL_MS);

  useEffect(() => {
    if (!focused) return;
    platform?.updatePetDesktopPet?.(toPetDesktopPet(pet));
  }, [focused, pet, platform]);

  useEffect(() => {
    if (!focused) return;
    platform?.updatePetDesktopStatus?.({
      enabled: petId !== PET_DISABLED_ID,
      desktopEnabled,
      animationsEnabled,
      theme: resolvedTheme,
      petSizePx,
      labels: statusLabels,
      tasks: publishedTasks,
    });
  }, [
    animationsEnabled,
    desktopEnabled,
    focused,
    petId,
    petSizePx,
    platform,
    publishedTasks,
    resolvedTheme,
    statusLabels,
  ]);

  return null;
}
