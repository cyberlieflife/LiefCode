import { describe, expect, it } from "vitest";
import {
  assessmentOutcome,
  computePolicyVersion,
  defaultSuperAgentSettings,
  gate,
  revalidateMandate,
} from "../src/policy.js";
import type { PolicyState, Thread, Trigger, Ticket } from "../src/types.js";

function trigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: "t1",
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

function thread(): Thread {
  return {
    key: "feishu:c1:root",
    source: "feishu",
    contextTicketIds: [],
    subscriptions: [],
    expiredEvals: 0,
    createdAt: 0,
  };
}

function settings(): { policy: PolicyState } {
  const value = defaultSuperAgentSettings("/tmp/sa");
  value.policy.version = computePolicyVersion(value.policy);
  value.policy.sources.feishu.allowed = [{ id: "ou_alice" }];
  return value;
}

function ticket(): Ticket {
  return {
    id: "ticket_1",
    shortName: "sa-1",
    title: "x",
    open: true,
    origin: { triggerId: "t1", triggerIds: ["t1"], strength: "explicit", ruleIds: [], basis: "addressed" },
    mandate: {
      policyVersion: "v1",
      strength: "explicit",
      ruleIds: [],
      scope: ["feishu:c1:root"],
      sender: "ou_alice",
      basis: "addressed",
    },
    execution: { name: "sa-1", directory: "/tmp/sa/sa-1" },
    follows: [{ thread: "feishu:c1:root", own: true }],
    inputs: [],
    createdAt: 0,
  };
}

describe("policy gate", () => {
  it("admits an allowlisted mention as explicit", () => {
    const result = gate({
      trigger: trigger(),
      thread: thread(),
      tickets: [],
      policy: settings().policy,
      observed: true,
    });
    expect(result.strength).toBe("explicit");
    expect(result.basis).toBe("addressed");
  });

  it("keeps unknown senders out by default", () => {
    const result = gate({
      trigger: trigger({ actor: "ou_stranger" }),
      thread: thread(),
      tickets: [],
      policy: settings().policy,
      observed: true,
    });
    expect(result.strength).toBe("not_admitted");
  });

  it("treats a message on an existing ticket thread as an explicit follow-up", () => {
    const result = gate({
      trigger: trigger({ actor: "ou_stranger" }),
      thread: thread(),
      tickets: [ticket()],
      policy: settings().policy,
      observed: false,
    });
    expect(result.strength).toBe("explicit");
    expect(result.basis).toBe("followup");
  });

  it("drops unaddressed messages when the source only sees mentions", () => {
    const result = gate({
      trigger: trigger({ addressed: undefined }),
      thread: thread(),
      tickets: [],
      policy: settings().policy,
      observed: false,
    });
    expect(result.strength).toBe("not_admitted");
  });

  it("records inferred acceptance without creating a ticket in observe mode", () => {
    const policy = settings().policy;
    policy.acceptMode = "observe";
    const result = assessmentOutcome(policy, "inferred", {
      outcome: "accept",
      matchedRuleIds: ["bug-fix"],
      reasons: [],
    });
    expect(result.outcome).toBe("ignore");
    expect(result.wouldAccept).toBe(true);
  });

  it("requires a matching enabled rule in auto mode", () => {
    const policy = settings().policy;
    policy.acceptMode = "auto";
    policy.rules = policy.rules.map((rule) => ({ ...rule, enabled: rule.id === "bug-fix" }));
    expect(
      assessmentOutcome(policy, "inferred", {
        outcome: "accept",
        matchedRuleIds: ["bug-fix"],
        reasons: [],
      }).outcome,
    ).toBe("accept");
    expect(
      assessmentOutcome(policy, "inferred", {
        outcome: "accept",
        matchedRuleIds: ["disabled-rule"],
        reasons: [],
      }).outcome,
    ).toBe("ignore");
  });
});

describe("mandate revalidation", () => {
  it("always allows an explicit follow-up", () => {
    const mandate = { ...ticket().mandate, basis: "followup" as const };
    expect(
      revalidateMandate(mandate, settings().policy, {
        allowlisted: false,
        botListed: false,
        threadListened: true,
      }),
    ).toBe(true);
  });

  it("revokes an addressed mandate when the sender leaves the allowlist", () => {
    expect(
      revalidateMandate(ticket().mandate, settings().policy, {
        allowlisted: false,
        botListed: false,
        threadListened: true,
      }),
    ).toBe(false);
  });

  it("requires the source to still listen to the thread", () => {
    expect(
      revalidateMandate(ticket().mandate, settings().policy, {
        allowlisted: true,
        botListed: true,
        threadListened: false,
      }),
    ).toBe(false);
  });
});
