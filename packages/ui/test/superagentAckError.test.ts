import { describe, expect, it } from "vitest";
import { describeSuperAgentAckError } from "@/superagent/types.js";

describe("describeSuperAgentAckError", () => {
  it("shows the protocol message for generic execution failures", () => {
    expect(
      describeSuperAgentAckError(
        {
          status: "failed",
          reasonCode: "fault.command.executionFailed",
          message: "github.repository must be owner/name",
        },
        "superagent_action_failed",
      ),
    ).toBe("github.repository must be owner/name");
  });

  it("keeps specific domain reason codes", () => {
    expect(
      describeSuperAgentAckError(
        {
          status: "failed",
          reasonCode: "superagent_router_exists",
          message: "another session owns the router",
        },
        "superagent_action_failed",
      ),
    ).toBe("superagent_router_exists");
  });

  it("falls back to the message or the provided default", () => {
    expect(describeSuperAgentAckError({ status: "failed", message: "boom" }, "fallback")).toBe(
      "boom",
    );
    expect(describeSuperAgentAckError(null, "fallback")).toBe("fallback");
  });
});
