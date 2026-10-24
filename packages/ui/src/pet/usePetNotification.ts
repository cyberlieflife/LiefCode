import type { PetNotificationKind, PetSnapshot } from "./contract.js";

const MAX_REVIEW_PREVIEW_CHARS = 80;

interface PetNotificationEvent {
  kind: PetNotificationKind;
  body: string | null;
  signature: string;
}

function truncateReviewPreview(text: string): string | null {
  const firstLine = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  return firstLine.length > MAX_REVIEW_PREVIEW_CHARS
    ? `${firstLine.slice(0, MAX_REVIEW_PREVIEW_CHARS - 1)}…`
    : firstLine;
}

function lastAssistantPreview(snapshot: PetSnapshot): {
  rowId: number | null;
  body: string | null;
} {
  for (let index = snapshot.rows.window.length - 1; index >= 0; index -= 1) {
    const row = snapshot.rows.window[index];
    if (row?.kind !== "assistantText" || typeof row.text !== "string") continue;
    const body = truncateReviewPreview(row.text);
    if (body) return { rowId: row.rowId, body };
  }
  return { rowId: null, body: null };
}

/**
 * 当前 turn 的流式正文：从末尾向前找，遇到最后一条 userInput 就停止。
 * 新一轮还没有正文时返回 null，卡片显示“正在思考”而不是上一轮的旧内容。
 */
function currentTurnAssistantPreview(snapshot: PetSnapshot): string | null {
  for (let index = snapshot.rows.window.length - 1; index >= 0; index -= 1) {
    const row = snapshot.rows.window[index];
    if (row?.kind === "userInput") return null;
    if (row?.kind !== "assistantText" || typeof row.text !== "string") continue;
    const body = truncateReviewPreview(row.text);
    if (body) return body;
  }
  return null;
}

/**
 * 把会话运行态映射为 Codex 的四种宠物通知。
 * 优先级与 Codex 的事件顺序一致：错误 > 等待输入 > 运行中 > 完成。
 */
export function derivePetNotificationEvent(
  snapshot: PetSnapshot | null,
): PetNotificationEvent | null {
  if (!snapshot) return null;
  const { phase, lastError } = snapshot.control;

  if (phase === "error") {
    return {
      kind: "failed",
      body: null,
      signature: `${snapshot.sessionId}:failed:${lastError?.at ?? 0}`,
    };
  }

  const blocking = snapshot.pendingInteractions.find(
    (interaction) => interaction.payload.kind !== "workspaceHookReview",
  );
  if (blocking) {
    return {
      kind: "waiting",
      body: null,
      signature: `${snapshot.sessionId}:waiting:${blocking.interactionId}`,
    };
  }

  if (phase === "running" || phase === "prewarming") {
    return {
      kind: "running",
      body: currentTurnAssistantPreview(snapshot),
      signature: `${snapshot.sessionId}:running`,
    };
  }

  if (phase === "completedSuccess" || phase === "completedInterrupted") {
    const preview = lastAssistantPreview(snapshot);
    return {
      kind: "review",
      body: preview.body,
      signature: `${snapshot.sessionId}:review:${preview.rowId ?? "none"}`,
    };
  }

  return null;
}
