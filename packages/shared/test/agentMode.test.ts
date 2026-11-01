import { describe, expect, it } from "vitest";
import { AGENT_MODES, DEFAULT_AGENT_MODE } from "../src/agent-mode.js";
import { appSettingsSchema } from "../src/validationAppSettings.js";
import { createSessionRequestedConfigSchema } from "../src/zcode-protocol-v4/create-session-config.js";
import { sessionConfigStateSchema } from "../src/zcode-protocol-v4/session-config.js";
import { parseCommandEnvelope } from "../src/zcode-protocol-v4/command.js";

describe("agent mode", () => {
  it("defaults the session config to agent for old snapshots", () => {
    const parsed = sessionConfigStateSchema.parse({
      provider: "p",
      model: "m",
      thought: "",
      followupMode: "queue",
    });
    expect(parsed.agentMode).toBe(DEFAULT_AGENT_MODE);
  });

  it("keeps an explicit superagent selection", () => {
    const parsed = sessionConfigStateSchema.parse({
      provider: "p",
      model: "m",
      thought: "",
      followupMode: "queue",
      agentMode: "superagent",
    });
    expect(parsed.agentMode).toBe("superagent");
  });

  it("uses agent as the app-level default and falls back on unknown values", () => {
    expect(appSettingsSchema.parse({}).defaultSessionMode).toBe("agent");
    expect(appSettingsSchema.parse({ defaultSessionMode: "unknown" }).defaultSessionMode).toBe(
      "agent",
    );
    expect(appSettingsSchema.parse({ defaultSessionMode: "superagent" }).defaultSessionMode).toBe(
      "superagent",
    );
  });

  it("only accepts known modes in the create-session config", () => {
    expect(createSessionRequestedConfigSchema.safeParse({ agentMode: "superagent" }).success).toBe(
      true,
    );
    expect(createSessionRequestedConfigSchema.safeParse({ agentMode: "router" }).success).toBe(
      false,
    );
    expect(AGENT_MODES).toEqual(["agent", "superagent"]);
  });

  it("requires a CAS revision for switchAgentMode", () => {
    const envelope = {
      commandId: "cmd-1",
      clientId: "client-1",
      sessionId: "s-1",
      baseLogEpoch: "epoch-1",
      type: "switchAgentMode" as const,
      payload: { agentMode: "superagent" as const },
      issuedAt: 1,
    };
    expect(parseCommandEnvelope(envelope).ok).toBe(false);
    expect(parseCommandEnvelope({ ...envelope, baseRevision: 2 }).ok).toBe(true);
  });
});
