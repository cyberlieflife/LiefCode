import { describe, expect, it } from "vitest";
import { SuperAgentEngine } from "../src/engine.js";
import { MemorySuperAgentStore } from "../src/memory-store.js";
import { computePolicyVersion, defaultSuperAgentSettings } from "../src/policy.js";
import { deriveTicketStage } from "../src/stage.js";
import type { Trigger } from "../src/types.js";

function setup() {
  const settings = defaultSuperAgentSettings("/tmp/sa");
  settings.policy.version = computePolicyVersion(settings.policy);
  settings.policy.sources.feishu.allowed = [{ id: "ou_alice" }];
  settings.policy.acceptMode = "auto";
  const store = new MemorySuperAgentStore(settings);
  const engine = new SuperAgentEngine({ store });
  return { store, engine };
}

function trigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: "m1",
    source: "feishu",
    threads: ["feishu:c1:root"],
    actor: "ou_alice",
    human: true,
    addressed: "mention",
    text: "fix the flaky test",
    at: 1000,
    channel: { conversation: "c1", anchor: "root" },
    ...overrides,
  };
}

describe("superagent engine", () => {
  it("stores a trigger once and queues an evaluation", () => {
    const { engine, store } = setup();
    const first = engine.receive(trigger());
    const second = engine.receive(trigger());
    expect(first.status).toBe("stored");
    expect(second.status).toBe("duplicate");
    expect(store.getEval("feishu:c1:root")?.triggerIds).toEqual(["m1"]);
  });

  it("creates a ticket and launch effect after an explicit acceptance", () => {
    const { engine, store } = setup();
    engine.receive(trigger());
    const decision = engine.recordAssessment({
      threadKey: "feishu:c1:root",
      triggerIds: ["m1"],
      strength: "explicit",
      assessment: {
        outcome: "accept",
        matchedRuleIds: [],
        reasonCodes: [{ code: "understand" }],
      },
    });
    expect(decision.outcome).toBe("accept");
    const [ticket] = store.listTickets();
    expect(ticket).toBeDefined();
    expect(ticket?.open).toBe(true);
    expect(ticket?.follows).toEqual([{ thread: "feishu:c1:root", own: true }]);
    expect(store.listEffects("launch")).toHaveLength(1);
    expect(deriveTicketStage(ticket!)).toBe("working/queued");
  });

  it("routes a human follow-up to the ticket without a new evaluation", () => {
    const { engine, store } = setup();
    engine.receive(trigger());
    engine.recordAssessment({
      threadKey: "feishu:c1:root",
      triggerIds: ["m1"],
      strength: "explicit",
      assessment: { outcome: "accept", matchedRuleIds: [], reasonCodes: [] },
    });
    const ticket = store.listTickets()[0]!;
    const result = engine.receive(trigger({ id: "m2", text: "also update the docs", at: 2000 }));
    expect(result.routedTicketIds).toEqual([ticket.id]);
    expect(store.getEval("feishu:c1:root")).toBeUndefined();
    expect(store.getTicket(ticket.id)?.inputs).toHaveLength(2);
  });

  it("keeps observe mode from creating a ticket", () => {
    const { engine, store } = setup();
    const settings = store.loadSettings()!;
    store.saveSettings({ ...settings, policy: { ...settings.policy, acceptMode: "observe" } });
    engine.receive(trigger({ addressed: undefined, actor: "ou_stranger" }));
    const decision = engine.recordAssessment({
      threadKey: "feishu:c1:root",
      triggerIds: ["m1"],
      strength: "inferred",
      assessment: { outcome: "accept", matchedRuleIds: ["bug-fix"], reasonCodes: [] },
    });
    expect(decision.outcome).toBe("ignore");
    expect(store.listTickets()).toHaveLength(0);
  });

  it("reports ready as awaiting review and stops on request", () => {
    const { engine, store } = setup();
    engine.receive(trigger());
    engine.recordAssessment({
      threadKey: "feishu:c1:root",
      triggerIds: ["m1"],
      strength: "explicit",
      assessment: { outcome: "accept", matchedRuleIds: [], reasonCodes: [] },
    });
    const ticket = store.listTickets()[0]!;
    engine.assignmentStarted(ticket.id, "worker_session");
    engine.report(ticket.id, { kind: "ready", text: "PR opened" });
    expect(deriveTicketStage(store.getTicket(ticket.id)!)).toBe("person/review");

    engine.stopTicket(ticket.id);
    const stopped = store.getTicket(ticket.id)!;
    expect(stopped.open).toBe(false);
    expect(stopped.outcome).toBe("stopped");
  });

  it("ends a ticket when its only followed thread closes", () => {
    const { engine, store } = setup();
    engine.receive(trigger());
    engine.recordAssessment({
      threadKey: "feishu:c1:root",
      triggerIds: ["m1"],
      strength: "explicit",
      assessment: { outcome: "accept", matchedRuleIds: [], reasonCodes: [] },
    });
    engine.threadClosed("feishu:c1:root", "merged");
    const ticket = store.getTicket(store.listTickets()[0]!.id)!;
    expect(ticket.open).toBe(false);
    expect(ticket.outcome).toBe("merged");
  });

  it("does not launch work while paused", () => {
    const { engine, store } = setup();
    engine.setPaused(true);
    engine.receive(trigger());
    engine.evaluateDue();
    expect(store.listEffects("assessment")).toHaveLength(0);
  });

  it("does not re-queue an evaluation that is already delivered", () => {
    let now = 0;
    const settings = defaultSuperAgentSettings("/tmp/sa");
    settings.policy.version = computePolicyVersion(settings.policy);
    settings.policy.evalTimeoutSeconds = 10;
    const store = new MemorySuperAgentStore(settings);
    const engine = new SuperAgentEngine({ store, clock: { now: () => now } });
    engine.receive(trigger());
    engine.evaluateDue();
    expect(store.getEval("feishu:c1:root")?.deliveredAt).toBe(0);
    expect(store.listEffects("assessment")).toHaveLength(1);
    now = 60_000;
    engine.evaluateDue();
    expect(store.listEffects("assessment")).toHaveLength(1);
  });

  it("records unavailable when the assessor keeps failing", () => {
    const { engine, store } = setup();
    engine.receive(trigger());
    engine.failAssessment("feishu:c1:root");
    const decisions = store.listDecisions("feishu:c1:root");
    expect(decisions[0]?.outcome).toBe("unavailable");
    expect(store.getEval("feishu:c1:root")).toBeUndefined();
  });
});
