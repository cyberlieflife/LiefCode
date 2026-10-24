import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@zcode/shared/zcode-protocol-v4";

import { PET_TASK_CARD_LIFETIME_MS } from "@/pet/contract.js";
import {
  buildPetTaskCards,
  phaseToPetKind,
  pickPetAnimationKind,
  taskCardDismissalKey,
  type PetTaskCardLabels,
} from "@/pet/petTaskCards.js";

const NOW = 1_000_000_000;

const labels: PetTaskCardLabels = {
  untitled: "新任务",
  thinking: "正在思考",
  waiting: "需要输入",
  completed: "已完成",
  failed: "已阻塞",
};

function summary(patch: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "session-1",
    workspaceId: "workspace-1",
    title: "新聊天",
    phase: "running",
    sessionEnded: false,
    hasBackgroundWork: false,
    lastActivityAt: NOW - 1000,
    createdAt: NOW - 10_000,
    ...patch,
  };
}

describe("phaseToPetKind", () => {
  it("maps session phases to card kinds", () => {
    expect(phaseToPetKind(summary({ phase: "running" }))).toBe("running");
    expect(phaseToPetKind(summary({ phase: "prewarming" }))).toBe("running");
    expect(phaseToPetKind(summary({ phase: "error" }))).toBe("failed");
    expect(phaseToPetKind(summary({ phase: "completedSuccess" }))).toBe("review");
    expect(phaseToPetKind(summary({ phase: "completedInterrupted" }))).toBe("review");
    expect(phaseToPetKind(summary({ phase: "draft" }))).toBeNull();
  });

  it("prefers waiting when the session has a blocking interaction", () => {
    expect(
      phaseToPetKind(
        summary({
          phase: "running",
          pendingInteractionSummary: { permissionCount: 1, userInputCount: 0 },
        }),
      ),
    ).toBe("waiting");
    expect(
      phaseToPetKind(
        summary({
          phase: "completedSuccess",
          pendingInteraction: { interactionId: "i-1", kind: "userInput" },
        }),
      ),
    ).toBe("waiting");
  });
});

describe("buildPetTaskCards", () => {
  it("builds title and detail with status fallbacks", () => {
    const cards = buildPetTaskCards({
      sessions: [
        summary({
          sessionId: "running",
          title: "修复登录",
          phase: "running",
          lastAssistantPreview: "正在改 auth.ts",
          lastActivityAt: NOW - 1000,
        }),
        summary({
          sessionId: "thinking",
          title: "",
          phase: "prewarming",
          lastActivityAt: NOW - 2000,
        }),
        summary({
          sessionId: "done",
          phase: "completedSuccess",
          lastAssistantPreview: "改好了",
          lastActivityAt: NOW - 3000,
        }),
      ],
      focused: null,
      labels,
      now: NOW,
    });

    expect(cards.map((card) => card.taskId)).toEqual(["running", "thinking", "done"]);
    const byId = new Map(cards.map((card) => [card.taskId, card]));
    expect(byId.get("running")?.detail).toBe("正在改 auth.ts");
    expect(byId.get("thinking")?.title).toBe("新任务");
    expect(byId.get("thinking")?.detail).toBe("正在思考");
    expect(byId.get("done")?.detail).toBe("改好了");

    const failed = buildPetTaskCards({
      sessions: [summary({ sessionId: "failed", phase: "error", title: "构建失败" })],
      focused: null,
      labels,
      now: NOW,
    });
    expect(failed[0]?.detail).toBe("已阻塞");
    expect(failed[0]?.kind).toBe("failed");
  });

  it("lets the focused snapshot override the indexed state and preview", () => {
    const cards = buildPetTaskCards({
      sessions: [summary({ sessionId: "session-1", phase: "completedSuccess" })],
      focused: { taskId: "session-1", kind: "running", preview: "流式输出中" },
      labels,
      now: NOW,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("running");
    expect(cards[0]?.detail).toBe("流式输出中");
  });

  it("adds a focused card before sessions-index catches up", () => {
    const cards = buildPetTaskCards({
      sessions: [],
      focused: { taskId: "brand-new", kind: "running", preview: null },
      labels,
      now: NOW,
    });

    expect(cards).toEqual([
      {
        taskId: "brand-new",
        kind: "running",
        title: "新任务",
        detail: "正在思考",
        lastActivityAt: NOW,
        expiresAt: NOW + 24 * 60 * 60 * 1000,
      },
    ]);
  });

  it("expires completed and failed cards but keeps running and waiting", () => {
    const reviewLifetime = PET_TASK_CARD_LIFETIME_MS.review;
    const failedLifetime = PET_TASK_CARD_LIFETIME_MS.failed;
    const cards = buildPetTaskCards({
      sessions: [
        summary({
          sessionId: "old-review",
          phase: "completedSuccess",
          lastActivityAt: NOW - (reviewLifetime ?? 0) - 1,
        }),
        summary({
          sessionId: "fresh-review",
          phase: "completedSuccess",
          lastActivityAt: NOW - 1000,
        }),
        summary({
          sessionId: "old-failed",
          phase: "error",
          lastActivityAt: NOW - (failedLifetime ?? 0) - 1,
        }),
        summary({ sessionId: "running", phase: "running", lastActivityAt: NOW - 999_999 }),
        summary({
          sessionId: "waiting",
          phase: "completedSuccess",
          lastActivityAt: NOW - 999_999,
          pendingInteractionSummary: { permissionCount: 0, userInputCount: 1 },
        }),
      ],
      focused: null,
      labels,
      now: NOW,
    });

    expect(cards.map((card) => card.taskId).sort()).toEqual(
      ["fresh-review", "running", "waiting"].sort(),
    );
  });

  it("drops archived sessions and the archived focused task", () => {
    const cards = buildPetTaskCards({
      sessions: [
        summary({ sessionId: "archived", phase: "running" }),
        summary({ sessionId: "visible", phase: "running" }),
      ],
      focused: { taskId: "archived-focused", kind: "review", preview: "done" },
      labels,
      now: NOW,
      excludedTaskIds: new Set(["archived", "archived-focused"]),
    });

    expect(cards.map((card) => card.taskId)).toEqual(["visible"]);
  });

  it("sorts by recent activity and caps the list at three cards", () => {
    const cards = buildPetTaskCards({
      sessions: [
        summary({ sessionId: "a", lastActivityAt: NOW - 4000 }),
        summary({ sessionId: "b", lastActivityAt: NOW - 1000 }),
        summary({ sessionId: "c", lastActivityAt: NOW - 3000 }),
        summary({ sessionId: "d", lastActivityAt: NOW - 2000 }),
      ],
      focused: null,
      labels,
      now: NOW,
    });

    expect(cards.map((card) => card.taskId)).toEqual(["b", "d", "c"]);
  });
});

describe("taskCardDismissalKey", () => {
  const card = (kind: "running" | "waiting" | "review" | "failed", expiresAt = NOW + 1000) => ({
    taskId: "session-1",
    kind,
    expiresAt,
  });

  it("only dismisses terminal cards and changes the key with the expiry window", () => {
    expect(taskCardDismissalKey(card("running"))).toBeNull();
    expect(taskCardDismissalKey(card("waiting"))).toBeNull();
    expect(taskCardDismissalKey(card("review"))).toBe(`session-1:${NOW + 1000}`);
    expect(taskCardDismissalKey(card("failed"))).toBe(`session-1:${NOW + 1000}`);
    // 同一会话下一轮的 expiresAt 变化 → 旧关闭键失效，新卡重新可见。
    expect(taskCardDismissalKey(card("review", NOW + 2000))).toBe(`session-1:${NOW + 2000}`);
  });
});

describe("pickPetAnimationKind", () => {
  const card = (kind: "running" | "waiting" | "review" | "failed") => ({
    taskId: kind,
    kind,
    title: "t",
    detail: "d",
    lastActivityAt: NOW,
    expiresAt: NOW + 1000,
  });

  it("prioritizes waiting over failed, running and review", () => {
    expect(
      pickPetAnimationKind([card("review"), card("running"), card("failed"), card("waiting")]),
    ).toBe("waiting");
    expect(pickPetAnimationKind([card("review"), card("running"), card("failed")])).toBe("failed");
    expect(pickPetAnimationKind([card("review"), card("running")])).toBe("running");
    expect(pickPetAnimationKind([card("review")])).toBe("review");
    expect(pickPetAnimationKind([])).toBeNull();
  });
});
