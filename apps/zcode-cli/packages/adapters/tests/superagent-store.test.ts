import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteSuperAgentStore } from "../src/storage/superagent-store/sqlite-superagent-store.js";
import { defaultSuperAgentSettings } from "@zcode/superagent";

const dirs: string[] = [];

function store(): SqliteSuperAgentStore {
  const dir = mkdtempSync(join(tmpdir(), "sa-store-"));
  dirs.push(dir);
  return new SqliteSuperAgentStore({ dbPath: join(dir, "superagent.sqlite") });
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("sqlite superagent store", () => {
  it("round-trips settings with revision history", () => {
    const db = store();
    const settings = defaultSuperAgentSettings("/tmp/sa");
    expect(db.loadSettings()).toBeUndefined();
    db.saveSettings(settings);
    db.saveSettings({ ...settings, policy: { ...settings.policy, acceptMode: "auto" } });
    expect(db.loadSettings()?.policy.acceptMode).toBe("auto");
    expect(db.settingsRevision()).toBe(2);
    db.close();
  });

  it("round-trips triggers, threads and tickets", () => {
    const db = store();
    db.saveTrigger({
      id: "t1",
      source: "github",
      threads: ["github:repo:1"],
      actor: "alice",
      human: true,
      text: "fix",
      at: 10,
      channel: { conversation: "repo", anchor: "1" },
    });
    db.saveThread({
      key: "github:repo:1",
      source: "github",
      contextTicketIds: [],
      subscriptions: [{ ticketId: "ticket_1", own: true }],
      expiredEvals: 0,
      createdAt: 1,
    });
    db.saveTicket({
      id: "ticket_1",
      shortName: "sa-1",
      title: "fix",
      open: true,
      origin: { triggerId: "t1", triggerIds: ["t1"], strength: "explicit", ruleIds: [], basis: "addressed" },
      mandate: { policyVersion: "v1", strength: "explicit", ruleIds: [], scope: [], sender: "alice", basis: "addressed" },
      execution: { name: "sa-1", directory: "/tmp/sa/sa-1" },
      assignment: { sessionId: "s1", status: "running", startedAt: 2 },
      follows: [{ thread: "github:repo:1", own: true }],
      inputs: [{ id: "i1", kind: "trigger", at: 10, human: true, text: "fix", triggerId: "t1" }],
      createdAt: 2,
    });

    expect(db.getTrigger("t1")?.threads).toEqual(["github:repo:1"]);
    expect(db.getThread("github:repo:1")?.subscriptions).toHaveLength(1);
    const ticket = db.getTicket("ticket_1");
    expect(ticket?.assignment?.sessionId).toBe("s1");
    expect(ticket?.inputs[0]?.text).toBe("fix");
    expect(db.listThreadTriggers("github:repo:1")).toHaveLength(1);
    db.close();
  });

  it("keeps effects, kv and health", () => {
    const db = store();
    const effect = db.enqueueEffect("launch", "launch:ticket_1", { ticketId: "ticket_1" }, 100);
    expect(db.listEffects("launch")).toHaveLength(1);
    db.failEffect(effect.id, 1, 200);
    expect(db.listEffects("launch")[0]?.nextAt).toBe(200);
    db.settleEffect(effect.id);
    expect(db.listEffects("launch")).toHaveLength(0);

    db.setKv("cursor", 42);
    expect(db.getKv("cursor")).toBe(42);

    db.setHealth({ part: "github", state: "ready", at: 1 });
    expect(db.health()[0]?.state).toBe("ready");
    db.close();
  });
});
