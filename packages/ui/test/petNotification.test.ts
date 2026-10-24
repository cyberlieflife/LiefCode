import { describe, expect, it } from "vitest";

import type { PetSnapshot } from "@/pet/contract.js";
import { derivePetNotificationEvent } from "@/pet/usePetNotification.js";

function snapshot(patch: Partial<PetSnapshot> = {}): PetSnapshot {
  return {
    sessionId: "session-1",
    control: { phase: "draft", lastError: null },
    pendingInteractions: [],
    rows: { window: [] },
    ...patch,
    // 深合并 control / rows，避免调用方漏字段。
    ...(patch.control ? { control: { ...patch.control } } : {}),
  } as PetSnapshot;
}

describe("derivePetNotificationEvent", () => {
  it("reports running for running and prewarming phases", () => {
    expect(derivePetNotificationEvent(snapshot({ control: { phase: "running", lastError: null } }))?.kind).toBe(
      "running",
    );
    expect(
      derivePetNotificationEvent(snapshot({ control: { phase: "prewarming", lastError: null } }))?.kind,
    ).toBe("running");
  });

  it("uses the current turn assistant text as the running preview", () => {
    const streaming = derivePetNotificationEvent(
      snapshot({
        control: { phase: "running", lastError: null },
        rows: {
          window: [
            { rowId: 1, kind: "userInput", text: "first" },
            { rowId: 2, kind: "assistantText", text: "old answer" },
            { rowId: 3, kind: "userInput", text: "second" },
            { rowId: 4, kind: "assistantText", text: "new answer\nmore" },
          ],
        },
      }),
    );
    expect(streaming?.kind).toBe("running");
    expect(streaming?.body).toBe("new answer");

    const justSent = derivePetNotificationEvent(
      snapshot({
        control: { phase: "running", lastError: null },
        rows: {
          window: [
            { rowId: 1, kind: "assistantText", text: "old answer" },
            { rowId: 2, kind: "userInput", text: "second" },
          ],
        },
      }),
    );
    expect(justSent?.body).toBeNull();
  });

  it("reports waiting for blocking interactions and ignores soft hook review", () => {
    const waiting = derivePetNotificationEvent(
      snapshot({
        control: { phase: "running", lastError: null },
        pendingInteractions: [
          { interactionId: "permission-1", payload: { kind: "permission" } },
        ],
      }),
    );
    expect(waiting?.kind).toBe("waiting");
    expect(waiting?.signature).toContain("permission-1");

    const softReview = derivePetNotificationEvent(
      snapshot({
        control: { phase: "running", lastError: null },
        pendingInteractions: [
          { interactionId: "hook-1", payload: { kind: "workspaceHookReview" } },
        ],
      }),
    );
    expect(softReview?.kind).toBe("running");
  });

  it("reports failed with the error timestamp in the signature", () => {
    const event = derivePetNotificationEvent(
      snapshot({
        control: {
          phase: "error",
          lastError: { code: "provider_error", message: "boom", at: 1234 },
        },
      }),
    );
    expect(event?.kind).toBe("failed");
    expect(event?.signature).toContain("1234");
    expect(event?.body).toBeNull();
  });

  it("previews the last complete assistant line on review", () => {
    const event = derivePetNotificationEvent(
      snapshot({
        control: { phase: "completedSuccess", lastError: null },
        rows: {
          window: [
            { rowId: 1, kind: "userInput", text: "hello" },
            { rowId: 2, kind: "assistantText", text: "First line\nSecond line" },
          ],
        },
      }),
    );
    expect(event?.kind).toBe("review");
    expect(event?.body).toBe("First line");
    expect(event?.signature).toContain("2");
  });

  it("truncates long previews and treats interrupted turns as review", () => {
    const text = "x".repeat(120);
    const event = derivePetNotificationEvent(
      snapshot({
        control: { phase: "completedInterrupted", lastError: null },
        rows: { window: [{ rowId: 9, kind: "assistantText", text }] },
      }),
    );
    expect(event?.kind).toBe("review");
    expect(event?.body).toHaveLength(80);
    expect(event?.body?.endsWith("…")).toBe(true);
  });

  it("stays idle for draft and missing snapshots", () => {
    expect(derivePetNotificationEvent(null)).toBeNull();
    expect(derivePetNotificationEvent(snapshot())).toBeNull();
  });
});
