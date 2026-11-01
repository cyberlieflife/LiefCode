import { describe, expect, it } from "vitest";
import { createSessionEvent, SessionEventType } from "@zcode/contracts";
import { ProductProjection } from "../src/zcode-protocol-v4/product-projection.js";

function agentModeEvent(to: "agent" | "superagent", from: "agent" | "superagent") {
  return createSessionEvent(
    SessionEventType.SessionAgentModeChanged,
    "session-1" as never,
    { from, to, reason: "command" },
  );
}

describe("superagent config seed", () => {
  it("seeds the persisted session mode without a visible delta", () => {
    const projection = new ProductProjection("session-1", "epoch-1");
    const before = projection.getSnapshot();
    projection.seedConfig({ agentMode: "superagent" });
    const after = projection.getSnapshot();
    expect(after.config.agentMode).toBe("superagent");
    expect(after.revision).toBe(before.revision);
  });

  it("lets the event win over later seeds", () => {
    const projection = new ProductProjection("session-1", "epoch-1");
    projection.seedConfig({ agentMode: "superagent" });
    const deltas = projection.applyEvent(agentModeEvent("agent", "superagent"));
    expect(deltas.length).toBeGreaterThan(0);
    expect(projection.getSnapshot().config.agentMode).toBe("agent");

    projection.seedConfig({ agentMode: "superagent" });
    expect(projection.getSnapshot().config.agentMode).toBe("agent");
  });
});
