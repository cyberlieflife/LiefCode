import { describe, expect, it } from "vitest";
import {
  claimSuperAgentRouter,
  getSuperAgentRouterSessionId,
  registerSuperAgentRouterDowngrade,
  releaseSuperAgentRouter,
  transferSuperAgentRouter,
} from "../src/app/superagent-router-registry.js";

describe("superagent router registry", () => {
  it("claims one router per project", () => {
    expect(claimSuperAgentRouter("project-a", "session-1")).toEqual({ ok: true });
    expect(claimSuperAgentRouter("project-a", "session-1")).toEqual({ ok: true });
    expect(claimSuperAgentRouter("project-a", "session-2")).toEqual({
      ok: false,
      sessionId: "session-1",
    });
    expect(getSuperAgentRouterSessionId("project-a")).toBe("session-1");
  });

  it("only releases the owning session", () => {
    claimSuperAgentRouter("project-b", "session-3");
    releaseSuperAgentRouter("project-b", "session-other");
    expect(getSuperAgentRouterSessionId("project-b")).toBe("session-3");
    releaseSuperAgentRouter("project-b", "session-3");
    expect(getSuperAgentRouterSessionId("project-b")).toBeUndefined();
  });

  it("allows a new router after release", () => {
    claimSuperAgentRouter("project-c", "session-4");
    releaseSuperAgentRouter("project-c", "session-4");
    expect(claimSuperAgentRouter("project-c", "session-5")).toEqual({ ok: true });
  });

  it("hands the router over when the old session can downgrade", async () => {
    claimSuperAgentRouter("project-d", "session-6");
    let downgraded = false;
    registerSuperAgentRouterDowngrade("project-d", "session-6", async () => {
      downgraded = true;
      return true;
    });
    expect(claimSuperAgentRouter("project-d", "session-7")).toEqual({
      ok: false,
      sessionId: "session-6",
    });
    await expect(transferSuperAgentRouter("project-d", "session-7")).resolves.toBe(true);
    expect(downgraded).toBe(true);
    expect(claimSuperAgentRouter("project-d", "session-7")).toEqual({ ok: true });
  });

  it("refuses the handover when the old session has open tickets", async () => {
    claimSuperAgentRouter("project-e", "session-8");
    registerSuperAgentRouterDowngrade("project-e", "session-8", async () => false);
    await expect(transferSuperAgentRouter("project-e", "session-9")).resolves.toBe(false);
    expect(getSuperAgentRouterSessionId("project-e")).toBe("session-8");
  });
});
