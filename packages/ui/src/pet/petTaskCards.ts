import type { SessionSummary } from "@zcode/shared/zcode-protocol-v4";
import { PET_DESKTOP_MAX_TASKS } from "@zcode/shared";

import {
  PET_TASK_CARD_LIFETIME_MS,
  type PetNotificationKind,
  type PetTaskCard,
} from "./contract.js";

const MAX_PREVIEW_CHARS = 80;
/** running / waiting 不按时间过期；这里给一个远期时间，随每次状态发布刷新。 */
const NO_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface PetTaskCardLabels {
  untitled: string;
  thinking: string;
  waiting: string;
  completed: string;
  failed: string;
}

/** 焦点会话的实时覆盖：sessions-index 有节流，当前 pane 的 phase 与正文更及时。 */
export interface PetFocusedTask {
  taskId: string;
  kind: PetNotificationKind;
  preview: string | null;
}

function normalizePreview(text: string | null | undefined): string | null {
  if (!text) return null;
  const firstLine = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  return firstLine.length > MAX_PREVIEW_CHARS
    ? `${firstLine.slice(0, MAX_PREVIEW_CHARS - 1)}…`
    : firstLine;
}

function hasPendingInteraction(summary: SessionSummary): boolean {
  if (summary.pendingInteraction) return true;
  const counts = summary.pendingInteractionSummary;
  if (!counts) return false;
  return counts.permissionCount + counts.userInputCount > 0;
}

/** sessions-index phase → 任务卡状态；draft 等不展示的 phase 返回 null。 */
export function phaseToPetKind(summary: SessionSummary): PetNotificationKind | null {
  if (hasPendingInteraction(summary)) return "waiting";
  switch (summary.phase) {
    case "running":
    case "prewarming":
      return "running";
    case "error":
      return "failed";
    case "completedSuccess":
    case "completedInterrupted":
      return "review";
    default:
      return null;
  }
}

function fallbackDetail(kind: PetNotificationKind, labels: PetTaskCardLabels): string {
  switch (kind) {
    case "running":
      return labels.thinking;
    case "waiting":
      return labels.waiting;
    case "review":
      return labels.completed;
    case "failed":
      return labels.failed;
  }
}

function detailFor(
  kind: PetNotificationKind,
  preview: string | null,
  labels: PetTaskCardLabels,
): string {
  // waiting 表示等待用户处理，不展示上一轮输出，避免把“等待输入”误导成“仍在输出”。
  if (kind === "waiting") return labels.waiting;
  return preview ?? fallbackDetail(kind, labels);
}

function expiresAtFor(kind: PetNotificationKind, lastActivityAt: number, now: number): number {
  const lifetime = PET_TASK_CARD_LIFETIME_MS[kind];
  return lifetime === null ? now + NO_EXPIRY_MS : lastActivityAt + lifetime;
}

/**
 * 已结束任务卡被点击后的本地关闭键。
 *
 * 键里带 expiresAt：同一会话开始新一轮后 lastActivityAt 变化、过期时间随之更新，
 * 旧关闭键自然失效，新任务卡可以重新出现；运行中/等待中的卡片不参与关闭。
 */
export function taskCardDismissalKey(
  card: Pick<PetTaskCard, "taskId" | "kind" | "expiresAt">,
): string | null {
  if (card.kind !== "review" && card.kind !== "failed") return null;
  return `${card.taskId}:${card.expiresAt}`;
}

function toCard(
  summary: SessionSummary,
  focused: PetFocusedTask | null,
  labels: PetTaskCardLabels,
  now: number,
): PetTaskCard | null {
  const isFocused = focused?.taskId === summary.sessionId;
  const kind = isFocused ? focused.kind : phaseToPetKind(summary);
  if (!kind) return null;
  const preview = isFocused ? focused.preview : normalizePreview(summary.lastAssistantPreview);
  const lastActivityAt = summary.lastActivityAt || now;
  const expiresAt = expiresAtFor(kind, lastActivityAt, now);
  if (expiresAt <= now) return null;
  const title = summary.title.trim() || labels.untitled;
  return {
    taskId: summary.sessionId,
    kind,
    title,
    detail: detailFor(kind, preview, labels),
    lastActivityAt,
    expiresAt,
  };
}

/**
 * 把 sessions-index 摘要与焦点会话覆盖合并成任务卡列表。
 *
 * - 只保留有展示状态的会话（draft 不出卡）；
 * - 焦点会话优先使用当前 pane 的 phase 与流式正文；
 * - failed / review 按最近活动时间过期，running / waiting 常驻；
 * - 按最近活动时间降序，最多 PET_DESKTOP_MAX_TASKS 条。
 */
export function buildPetTaskCards(params: {
  sessions: readonly SessionSummary[];
  focused: PetFocusedTask | null;
  labels: PetTaskCardLabels;
  now: number;
  /** 已归档会话不再出卡；归档不删除 sessions-index 摘要，必须由调用方过滤。 */
  excludedTaskIds?: ReadonlySet<string>;
}): PetTaskCard[] {
  const { sessions, focused, labels, now, excludedTaskIds } = params;
  const cards: PetTaskCard[] = [];
  const seen = new Set<string>();

  for (const summary of sessions) {
    if (excludedTaskIds?.has(summary.sessionId)) continue;
    const card = toCard(summary, focused, labels, now);
    if (!card || seen.has(card.taskId)) continue;
    seen.add(card.taskId);
    cards.push(card);
  }

  // 新会话可能还没进入 sessions-index：只要当前 pane 已经进入可展示状态就先出一张卡。
  if (focused && !seen.has(focused.taskId) && !excludedTaskIds?.has(focused.taskId)) {
    const lastActivityAt = now;
    const expiresAt = expiresAtFor(focused.kind, lastActivityAt, now);
    cards.push({
      taskId: focused.taskId,
      kind: focused.kind,
      title: labels.untitled,
      detail: detailFor(focused.kind, focused.preview, labels),
      lastActivityAt,
      expiresAt,
    });
  }

  cards.sort((left, right) => {
    if (right.lastActivityAt !== left.lastActivityAt) {
      return right.lastActivityAt - left.lastActivityAt;
    }
    return left.taskId.localeCompare(right.taskId);
  });
  return cards.slice(0, PET_DESKTOP_MAX_TASKS);
}

/** 多任务时的状态动画：等待输入优先，其次是错误、运行、完成。 */
export function pickPetAnimationKind(
  cards: readonly Pick<PetTaskCard, "kind">[],
): PetNotificationKind | null {
  if (cards.length === 0) return null;
  const kinds = new Set(cards.map((card) => card.kind));
  if (kinds.has("waiting")) return "waiting";
  if (kinds.has("failed")) return "failed";
  if (kinds.has("running")) return "running";
  return "review";
}
