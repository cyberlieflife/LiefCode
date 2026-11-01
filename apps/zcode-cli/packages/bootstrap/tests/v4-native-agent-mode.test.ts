import { describe, expect, it, vi } from "vitest";
import { DefaultRuntimeConfig } from "@zcode/contracts";
import { createSessionFacade } from "../src/app/session-facade.js";
import { modelConfigHandlers } from "../src/zcode-protocol-v4/commands/handlers/model-config.js";
import { V4CommandNoopError } from "../src/zcode-protocol-v4/v4-gateway.js";

function host(mode: string) {
  const calls: { mode: string; options?: unknown }[] = [];
  const record = {
    app: {
      getAgentMode: () => mode,
      setAgentMode: async (next: string, options?: unknown) => {
        calls.push({ mode: next, ...(options ? { options } : {}) });
        return { agentMode: next, previousAgentMode: mode, traceId: "t" };
      },
    },
  };
  return {
    calls,
    host: { getRecord: (id: string) => (id === "s1" ? record : undefined) } as never,
  };
}

function envelope(payload: Record<string, unknown>) {
  return { type: "switchAgentMode", sessionId: "s1", payload } as never;
}

describe("switchAgentMode handler", () => {
  it("forwards the requested mode to the app facade", async () => {
    const { calls, host: fakeHost } = host("agent");
    await modelConfigHandlers.switchAgentMode(fakeHost, envelope({ agentMode: "superagent" }));
    expect(calls).toEqual([{ mode: "superagent", options: { endOpenTickets: undefined } }]);
  });

  it("passes endOpenTickets through when downgrading", async () => {
    const { calls, host: fakeHost } = host("superagent");
    await modelConfigHandlers.switchAgentMode(
      fakeHost,
      envelope({ agentMode: "agent", endOpenTickets: true }),
    );
    expect(calls).toEqual([{ mode: "agent", options: { endOpenTickets: true } }]);
  });

  it("treats a same-mode switch as a noop", async () => {
    const { host: fakeHost } = host("superagent");
    await expect(
      modelConfigHandlers.switchAgentMode(fakeHost, envelope({ agentMode: "superagent" })),
    ).rejects.toBeInstanceOf(V4CommandNoopError);
  });
});

describe("session facade superagent lifecycle", () => {
  it("starts the runtime on upgrade and stops it on downgrade", async () => {
    const events: string[] = [];
    const stub = {
      start: () => events.push("start"),
      stop: async () => {
        events.push("stop");
      },
      snapshot: () => ({}),
      saveSettings: () => ({}),
      savePrompts: () => ({}),
      pause: () => undefined,
      ticketAction: () => undefined,
      reevaluate: () => undefined,
      dismiss: () => undefined,
      unsubscribe: () => undefined,
      note: () => undefined,
      requestStatus: () => undefined,
    };
    let mode = "agent";
    const facade = createSessionFacade({
      configResult: { config: DefaultRuntimeConfig },
      sessionId: "facade-mode-session",
      projectID: "facade-mode-project",
      workingDirectory: "/tmp/facade-mode",
      traceContext: { traceId: "facade-mode" },
      runtime: {
        getMode: () => "build",
        getAgentMode: () => mode,
        setAgentMode: async (next: string) => {
          mode = next;
          events.push(`set:${next}`);
        },
      },
      logger: { info: vi.fn(), warn: vi.fn() },
      createSuperAgentRuntime: () => stub,
    } as never);

    await facade.setAgentMode("superagent");
    expect(events).toEqual(["set:superagent", "start"]);

    await facade.setAgentMode("agent");
    expect(events).toEqual(["set:superagent", "start", "stop", "set:agent"]);
  });

  it("keeps the mode when the runtime fails to start", async () => {
    const events: string[] = [];
    let mode = "agent";
    const facade = createSessionFacade({
      configResult: { config: DefaultRuntimeConfig },
      sessionId: "facade-mode-failing-session",
      projectID: "facade-mode-failing-project",
      workingDirectory: "/tmp/facade-mode-failing",
      traceContext: { traceId: "facade-mode-failing" },
      runtime: {
        getMode: () => "build",
        getAgentMode: () => mode,
        setAgentMode: async (next: string) => {
          mode = next;
          events.push(`set:${next}`);
        },
      },
      logger: { info: vi.fn(), warn: vi.fn() },
      createSuperAgentRuntime: () => ({
        start: () => {
          throw new Error("database unavailable");
        },
        stop: async () => undefined,
        snapshot: () => ({}),
      }),
    } as never);

    await expect(facade.setAgentMode("superagent")).resolves.toMatchObject({
      agentMode: "superagent",
    });
    expect(events).toEqual(["set:superagent"]);
  });
});
