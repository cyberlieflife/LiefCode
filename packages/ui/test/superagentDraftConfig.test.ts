import { describe, expect, it } from "vitest";
import { buildDraftCreateConfigPayload } from "../src/v4/composer/useDraftConfigControl.js";
import { resolveDraftDisplayedConfig } from "../src/v4/composer/draftWorkspaceDefaults.js";

describe("superagent draft config", () => {
  it("carries the agent mode into createSession.config", () => {
    expect(buildDraftCreateConfigPayload({ agentMode: "superagent" })).toEqual({
      config: { agentMode: "superagent" },
    });
    expect(buildDraftCreateConfigPayload({ agentMode: "agent" })).toEqual({
      config: { agentMode: "agent" },
    });
  });

  it("shows the draft mode without inventing one for legacy drafts", () => {
    const selection = { providerId: "p", modelId: "m" };
    expect(resolveDraftDisplayedConfig({ modelSelection: selection })?.agentMode).toBe("agent");
    expect(
      resolveDraftDisplayedConfig({ modelSelection: selection, agentMode: "superagent" })
        ?.agentMode,
    ).toBe("superagent");
  });
});
