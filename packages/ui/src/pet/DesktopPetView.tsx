import type { PetDesktopPet, PetDesktopStatus, PetDesktopTaskCard } from "@zcode/shared";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import { petAnimationDurationMs } from "./codexPetFormat.js";
import { fromPetDesktopPet } from "./desktopPetPayload.js";
import { pickPetAnimationKind, taskCardDismissalKey } from "./petTaskCards.js";
import { PetSprite } from "./PetSprite.js";
import { useAmbientPetFrame, type ManualPetAnimation } from "./useAmbientPetFrame.js";

const WINDOW_PADDING_PX = 12;
const CARD_GAP_PX = 8;
const CARD_STACK_GAP_PX = 6;
const CARD_WIDTH_PX = 248;
const DRAG_THRESHOLD_PX = 6;
const MIN_PET_SIZE_PX = 96;
const MAX_PET_SIZE_PX = 256;

const HOVER_ANIMATION_PREFERENCE = ["hover", "jumping", "idle"] as const;
const SEND_ANIMATION_PREFERENCE = ["waving", "wave", "jumping", "idle"] as const;
const COMPLETE_ANIMATION_PREFERENCE = ["jumping", "bounce", "waving", "review", "idle"] as const;

type PetAnimations = ReturnType<typeof fromPetDesktopPet>["animations"];
type TaskKind = PetDesktopTaskCard["kind"];

export interface DesktopPetWindowBridge {
  dragStart(): void;
  dragMove(): void;
  dragEnd(): void;
  activateMainWindow(): void;
  /** 恢复主窗口并切到指定会话。 */
  activateTask(taskId: string): void;
  showContextMenu(): void;
  resize(width: number, height: number): void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type DragDirection = "left" | "right";

function cardColors(theme: PetDesktopStatus["theme"]): CSSProperties {
  return theme === "dark"
    ? {
        background: "rgba(26, 26, 30, 0.94)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        color: "#f5f5f7",
        boxShadow: "0 10px 26px rgba(0, 0, 0, 0.38)",
      }
    : {
        background: "rgba(255, 255, 255, 0.98)",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        color: "#1d1d1f",
        boxShadow: "0 10px 26px rgba(0, 0, 0, 0.16)",
      };
}

function pickAnimationName(animations: PetAnimations, preferences: readonly string[]): string | null {
  return preferences.find((name) => animations[name]) ?? null;
}

function animationDuration(animations: PetAnimations, name: string): number {
  const animation = animations[name];
  if (!animation) return 0;
  return petAnimationDurationMs(animation);
}

/** 只保留未过期的任务卡；到期后自动回落，避免主窗口节流时卡片长期滞留。 */
function useActiveTaskCards(
  tasks: readonly PetDesktopTaskCard[],
): readonly PetDesktopTaskCard[] {
  const [now, setNow] = useState(() => Date.now());
  const visible = useMemo(() => tasks.filter((task) => task.expiresAt > now), [now, tasks]);

  useEffect(() => {
    if (visible.length === 0) return;
    const nextExpiry = Math.min(...visible.map((task) => task.expiresAt));
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - Date.now()) + 16);
    return () => clearTimeout(timer);
  }, [visible]);

  return visible;
}

/** 状态动画只在 kind 变化时重新计时，避免流式正文刷新把动画帧反复重置。 */
function useStateAnimation(kind: TaskKind | null): {
  kind: TaskKind | null;
  startedAt: number;
} {
  const stateRef = useRef<{ kind: TaskKind | null; startedAt: number }>({
    kind: null,
    startedAt: Date.now(),
  });
  if (stateRef.current.kind !== kind) {
    stateRef.current = { kind, startedAt: Date.now() };
  }
  return stateRef.current;
}

/**
 * 发送与完成各播放一次动画。第一帧只建立基线，避免窗口刚创建时把历史状态重放一遍。
 */
function useReactionAnimation(
  cards: readonly PetDesktopTaskCard[],
  animations: PetAnimations,
): ManualPetAnimation | null {
  const [reaction, setReaction] = useState<ManualPetAnimation | null>(null);
  const previousKindsRef = useRef<Map<string, TaskKind> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const nextKinds = new Map(cards.map((card) => [card.taskId, card.kind] as const));
    const previousKinds = previousKindsRef.current;
    previousKindsRef.current = nextKinds;
    if (!previousKinds) return;

    let name: string | null = null;
    for (const card of cards) {
      const previousKind = previousKinds.get(card.taskId);
      // 新任务第一次出现 running，或从完成态重新进入 running，都视为发送了一条消息。
      if (card.kind === "running" && previousKind !== "running") {
        name = pickAnimationName(animations, SEND_ANIMATION_PREFERENCE);
        break;
      }
      if (card.kind === "review" && previousKind === "running") {
        name = pickAnimationName(animations, COMPLETE_ANIMATION_PREFERENCE);
        break;
      }
    }
    if (!name) return;

    const duration = animationDuration(animations, name);
    setReaction({ name, startedAt: Date.now() });
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setReaction(null);
    }, Math.max(280, duration));
  }, [animations, cards]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return reaction;
}

function TaskStatusIcon({ kind }: { kind: TaskKind }) {
  if (kind === "review") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path
          d="M3.5 8.5l3 3 6-6"
          fill="none"
          stroke="#45c777"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "failed") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path
          d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"
          fill="none"
          stroke="#ef5f5f"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // running / waiting 不额外加图标，标题与小字已经表达状态。
  return null;
}

function TaskCard({
  card,
  theme,
  onClick,
}: {
  card: PetDesktopTaskCard;
  theme: PetDesktopStatus["theme"];
  onClick: () => void;
}) {
  return (
    <div
      data-testid="desktop-pet-task"
      data-pet-task-id={card.taskId}
      data-pet-task-kind={card.kind}
      role="button"
      tabIndex={-1}
      aria-label={`${card.title} ${card.detail}`}
      title={`${card.title}\n${card.detail}`}
      onClick={onClick}
      style={{
        ...cardColors(theme),
        width: "100%",
        boxSizing: "border-box",
        padding: "9px 12px",
        borderRadius: 14,
        textAlign: "left",
        cursor: "pointer",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 600,
            lineHeight: "18px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.title}
        </div>
        <TaskStatusIcon kind={card.kind} />
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 11,
          lineHeight: "15px",
          opacity: 0.62,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {card.detail}
      </div>
    </div>
  );
}

/** 多任务时提供折叠开关；折叠后只保留数量与展开入口，窗口高度随之收缩。 */
function TaskListToggle({
  theme,
  count,
  collapsed,
  labels,
  onToggle,
}: {
  theme: PetDesktopStatus["theme"];
  count: number;
  collapsed: boolean;
  labels: PetDesktopStatus["labels"];
  onToggle: () => void;
}) {
  const label = collapsed ? labels.expandTasks : labels.collapseTasks;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        type="button"
        data-testid="desktop-pet-tasks-toggle"
        data-pet-tasks-collapsed={collapsed ? "true" : "false"}
        aria-expanded={!collapsed}
        aria-label={label}
        title={label}
        onClick={onToggle}
        style={{
          ...cardColors(theme),
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 11,
          lineHeight: "16px",
          cursor: "pointer",
          pointerEvents: "auto",
        }}
      >
        <span>{count}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d={collapsed ? "M2 6.5 5 3.5 8 6.5" : "M2 3.5 5 6.5 8 3.5"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function pickDragAnimation(animations: PetAnimations, direction: DragDirection): string {
  const preferred = direction === "left" ? "running-left" : "running-right";
  if (animations[preferred]) return preferred;
  if (animations.running) return "running";
  if (animations.jumping) return "jumping";
  if (animations.waving) return "waving";
  return "idle";
}

/**
 * 独立桌面宠物窗口的展示层。窗口由主进程创建和移动；这里处理精灵动画、
 * 多任务卡片、悬停反应、拖动方向动画，并把内容尺寸回传给主进程做自适应。
 */
export function DesktopPetView({
  pet,
  status,
  bridge,
}: {
  pet: PetDesktopPet;
  status: PetDesktopStatus;
  bridge: DesktopPetWindowBridge;
}) {
  const petDefinition = useMemo(() => fromPetDesktopPet(pet), [pet]);
  const activeCards = useActiveTaskCards(status.tasks);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedCards, setDismissedCards] = useState<ReadonlySet<string>>(() => new Set());

  // 已结束的卡被点击后本地关闭；同一会话进入下一轮会拿到新的 expiresAt，旧关闭键自动失效。
  const dismissalCandidates = useMemo(() => {
    const keys = new Set<string>();
    for (const task of status.tasks) {
      const key = taskCardDismissalKey(task);
      if (key) keys.add(key);
    }
    return keys;
  }, [status.tasks]);
  useEffect(() => {
    setDismissedCards((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of current) {
        if (dismissalCandidates.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [dismissalCandidates]);
  const cards = useMemo(
    () =>
      activeCards.filter((card) => {
        const key = taskCardDismissalKey(card);
        return key === null || !dismissedCards.has(key);
      }),
    [activeCards, dismissedCards],
  );
  const canCollapse = cards.length > 1;
  const tasksCollapsed = collapsed && canCollapse;
  const stateKind = pickPetAnimationKind(cards);
  const stateAnimation = useStateAnimation(stateKind);
  const reaction = useReactionAnimation(cards, petDefinition.animations);
  const petSizePx = Math.min(
    MAX_PET_SIZE_PX,
    Math.max(MIN_PET_SIZE_PX, Math.round(status.petSizePx)),
  );
  const [dragging, setDragging] = useState(false);
  const [dragAnimation, setDragAnimation] = useState<ManualPetAnimation | null>(null);
  const [hoverAnimation, setHoverAnimation] = useState<ManualPetAnimation | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<DragDirection | null>(null);
  const lastScreenXRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const manualAnimation = dragAnimation ?? reaction ?? hoverAnimation;
  const stateNotification =
    stateAnimation.kind === null
      ? null
      : { kind: stateAnimation.kind, body: null, startedAt: stateAnimation.startedAt };
  const frame = useAmbientPetFrame(
    petDefinition,
    stateNotification,
    status.animationsEnabled,
    manualAnimation,
  );

  useLayoutEffect(() => {
    if (!status.enabled || !status.desktopEnabled) return;
    const petWidth = petRef.current?.getBoundingClientRect().width ?? 0;
    const cardsBox = cardsRef.current?.getBoundingClientRect() ?? null;
    if (petWidth <= 0) return;
    const width = Math.ceil(Math.max(petWidth, cardsBox?.width ?? 0) + WINDOW_PADDING_PX * 2);
    const height = Math.ceil(
      petSizePx +
        WINDOW_PADDING_PX * 2 +
        (cardsBox && cardsBox.height > 0 ? cardsBox.height + CARD_GAP_PX : 0),
    );
    bridge.resize(width, height);
  }, [
    bridge,
    cards,
    petDefinition.frame.width,
    petDefinition.frame.height,
    petSizePx,
    status.desktopEnabled,
    status.enabled,
    tasksCollapsed,
  ]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    },
    [],
  );

  if (!status.enabled || !status.desktopEnabled) return null;

  const updateDragDirection = (direction: DragDirection) => {
    if (dragDirectionRef.current === direction) return;
    dragDirectionRef.current = direction;
    setDragAnimation({
      name: pickDragAnimation(petDefinition.animations, direction),
      startedAt: Date.now(),
    });
  };

  // 指针事件一帧内可能到达多次；合并成每帧最多一条 IPC，避免主进程堆满窗口定位。
  const cancelScheduledDragMove = () => {
    if (dragFrameRef.current === null) return;
    cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
  };

  const scheduleDragMove = () => {
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      if (dragRef.current) bridge.dragMove();
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cancelScheduledDragMove();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      moved: false,
    };
    lastScreenXRef.current = event.screenX;
    dragDirectionRef.current = null;
    updateDragDirection("right");
    setDragging(true);
    bridge.dragStart();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (
      !drag.moved &&
      Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY) > DRAG_THRESHOLD_PX
    ) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    const lastScreenX = lastScreenXRef.current;
    if (lastScreenX !== null) {
      const deltaX = event.screenX - lastScreenX;
      if (Math.abs(deltaX) >= 2) {
        lastScreenXRef.current = event.screenX;
        updateDragDirection(deltaX < 0 ? "left" : "right");
      }
    }
    scheduleDragMove();
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    dragDirectionRef.current = null;
    lastScreenXRef.current = null;
    cancelScheduledDragMove();
    setDragging(false);
    setDragAnimation(null);
    try {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    } catch {
      // pointer capture 可能已被系统释放，忽略即可。
    }
    bridge.dragEnd();
    // 用抬指位置复核位移：窗口跟随鼠标时可能丢掉 pointermove，不能让拖动被当成单击。
    const moved =
      drag.moved ||
      Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY) > DRAG_THRESHOLD_PX;
    if (!cancelled && !moved) bridge.activateMainWindow();
  };

  const handlePointerEnter = () => {
    if (dragging) return;
    const name = pickAnimationName(petDefinition.animations, HOVER_ANIMATION_PREFERENCE);
    if (!name) return;
    const startedAt = Date.now();
    setHoverAnimation({ name, startedAt });
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      setHoverAnimation(null);
    }, Math.max(280, animationDuration(petDefinition.animations, name)));
  };

  const handlePointerLeave = () => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverAnimation(null);
  };

  const activateCard = (card: PetDesktopTaskCard) => {
    const key = taskCardDismissalKey(card);
    if (key) {
      setDismissedCards((current) => {
        if (current.has(key)) return current;
        const next = new Set(current);
        next.add(key);
        return next;
      });
    }
    bridge.activateTask(card.taskId);
  };

  return (
    <div
      data-testid="desktop-pet"
      data-pet-animation={frame.animationName}
      data-pet-size={petSizePx}
      data-pet-task-count={cards.length}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "transparent",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {cards.length > 0 ? (
        <div
          ref={cardsRef}
          data-pet-tasks-collapsed={tasksCollapsed ? "true" : "false"}
          style={{
            position: "absolute",
            right: WINDOW_PADDING_PX,
            bottom: petSizePx + CARD_GAP_PX + WINDOW_PADDING_PX,
            display: "flex",
            flexDirection: "column",
            gap: CARD_STACK_GAP_PX,
            width: CARD_WIDTH_PX,
          }}
        >
          {canCollapse ? (
            <TaskListToggle
              theme={status.theme}
              count={cards.length}
              collapsed={tasksCollapsed}
              labels={status.labels}
              onToggle={() => setCollapsed((value) => !value)}
            />
          ) : null}
          {tasksCollapsed
            ? null
            : cards.map((card) => (
                <TaskCard
                  key={card.taskId}
                  card={card}
                  theme={status.theme}
                  onClick={() => activateCard(card)}
                />
              ))}
        </div>
      ) : null}
      <div
        ref={petRef}
        data-pet-interactive="true"
        role="button"
        aria-label={pet.displayName}
        title={pet.displayName}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        onPointerCancel={(event) => finishPointer(event, true)}
        // 窗口移动或被系统接管时可能丢失指针捕获；不结束拖动会让宠物永久停在拖拽态。
        onLostPointerCapture={(event) => finishPointer(event, true)}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(event) => {
          event.preventDefault();
          bridge.showContextMenu();
        }}
        style={{
          position: "absolute",
          right: WINDOW_PADDING_PX,
          bottom: WINDOW_PADDING_PX,
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          pointerEvents: "auto",
        }}
      >
        <PetSprite pet={petDefinition} spriteIndex={frame.spriteIndex} heightPx={petSizePx} />
      </div>
    </div>
  );
}
