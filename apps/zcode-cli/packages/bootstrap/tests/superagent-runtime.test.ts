import { describe, expect, it } from "vitest";
import type { ExecutorPort, Ticket } from "@zcode/superagent";
import { MemorySuperAgentStore, defaultSuperAgentSettings } from "@zcode/superagent";
import { SuperAgentRuntime } from "../src/app/superagent/runtime.js";

class FakeExecutor implements ExecutorPort {
  launched: string[] = [];
  delivered: string[] = [];
  stopped: string[] = [];
  async launch(ticket: Ticket) {
    this.launched.push(ticket.id);
    return { sessionId: `worker_${ticket.shortName}` };
  }
  async deliver(ticket: Ticket, inputIds: string[]) {
    this.delivered.push(`${ticket.id}:${inputIds.length}`);
  }
  async stop(ticket: Ticket) {
    this.stopped.push(ticket.id);
  }
}

function runtime() {
  const settings = defaultSuperAgentSettings("/tmp/sa-work");
  settings.policy.sources.feishu.allowed = [{ id: "ou_alice" }];
  settings.executor.unattendedWorkers = true;
  settings.sources.github.enabled = false;
  settings.sources.feishu.enabled = false;
  const store = new MemorySuperAgentStore(settings);
  store.setKv("settings:revision", 1);
  const executor = new FakeExecutor();
  const relays: string[] = [];
  const value = new SuperAgentRuntime({
    store,
    workspaceKey: "workspace-a",
    ownerId: "test-owner",
    executionRoot: "/tmp/sa-work",
    runner: {
      async run() {
        throw new Error("sources are disabled in this test");
      },
    },
    relay: (text) => relays.push(text),
    executor,
    passIntervalMs: 60_000,
    pollIntervalMs: 60_000,
  });
  value.start();
  return { runtime: value, store, executor, relays };
}

describe("superagent runtime", () => {
  it("runs assessment → ticket → launch through the effect queue", async () => {
    const { runtime: sa, store, executor, relays } = runtime();
    sa.engineRef.receive({
      id: "m1",
      source: "feishu",
      threads: ["feishu:chat:root"],
      actor: "ou_alice",
      human: true,
      addressed: "mention",
      text: "fix the flaky test",
      at: Date.now(),
      channel: { conversation: "chat", anchor: "root" },
    });
    await sa.pass();
    const ticket = store.listTickets()[0];
    expect(ticket).toBeDefined();
    // 新一轮 pass 才会取到刚入队的 launch effect（与 2s 调度节拍一致）。
    await sa.pass();
    expect(executor.launched).toEqual([ticket!.id]);
    expect(relays.some((text) => text.includes(ticket!.shortName))).toBe(true);
    expect(sa.snapshot().tickets[0]?.stage).toBe("working");
    await sa.stop();
  });

  it("does no work while paused", async () => {
    const { runtime: sa, store, executor } = runtime();
    sa.pause(true);
    sa.engineRef.receive({
      id: "m2",
      source: "feishu",
      threads: ["feishu:chat:root2"],
      actor: "ou_alice",
      human: true,
      addressed: "mention",
      text: "review this",
      at: Date.now(),
      channel: { conversation: "chat", anchor: "root2" },
    });
    await sa.pass();
    expect(store.listTickets()).toHaveLength(0);
    expect(executor.launched).toHaveLength(0);
    await sa.stop();
  });

  it("rejects stale settings revisions", async () => {
    const { runtime: sa, store } = runtime();
    expect(() => sa.saveSettings("executor", {}, 0)).toThrow(/stale settings revision/u);
    const revision = Number(store.getKv("settings:revision"));
    const settings = sa.settings();
    expect(() =>
      sa.saveSettings("executor", { ...settings.executor, maxWorkers: 3 }, revision),
    ).not.toThrow();
    expect(sa.snapshot().executorSettings.maxWorkers).toBe(3);
    await sa.stop();
  });

  it("saves sources while disabled entries stay unconfigured", async () => {
    const { runtime: sa, store } = runtime();
    const revision = Number(store.getKv("settings:revision"));
    const settings = sa.settings();
    // 启用中的来源仍要校验：空 repository 不能启用。
    expect(() =>
      sa.saveSettings(
        "sources",
        {
          ...settings.sources,
          github: { ...settings.sources.github, enabled: true },
        },
        revision,
      ),
    ).toThrow(/owner\/name/u);
    // 未启用的来源保留空配置时，不影响其它来源保存。
    expect(() =>
      sa.saveSettings(
        "sources",
        {
          ...settings.sources,
          feishu: { ...settings.sources.feishu, enabled: true },
        },
        revision,
      ),
    ).not.toThrow();
    expect(sa.snapshot().sourceSettings.github).toMatchObject({
      enabled: false,
      repository: "",
    });
    expect(sa.snapshot().sourceSettings.feishu).toMatchObject({ enabled: true });
    await sa.stop();
  });

  it("saves an enabled GitHub source once repository is configured", async () => {
    const { runtime: sa, store } = runtime();
    const revision = Number(store.getKv("settings:revision"));
    const settings = sa.settings();
    expect(() =>
      sa.saveSettings(
        "sources",
        {
          ...settings.sources,
          github: { ...settings.sources.github, enabled: true, repository: "octo/repo" },
        },
        revision,
      ),
    ).not.toThrow();
    expect(sa.snapshot().sourceSettings.github).toMatchObject({
      enabled: true,
      repository: "octo/repo",
    });
    await sa.stop();
  });

  it("ends a ticket when stopped and asks the executor to stop", async () => {
    const { runtime: sa, store, executor } = runtime();
    sa.engineRef.receive({
      id: "m3",
      source: "feishu",
      threads: ["feishu:chat:root3"],
      actor: "ou_alice",
      human: true,
      addressed: "mention",
      text: "fix it",
      at: Date.now(),
      channel: { conversation: "chat", anchor: "root3" },
    });
    await sa.pass();
    const ticket = store.listTickets()[0]!;
    sa.ticketAction(ticket.id, "stop");
    expect(store.getTicket(ticket.id)?.outcome).toBe("stopped");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executor.stopped).toEqual([ticket.id]);
    await sa.stop();
  });
});
