import { describe, expect, it } from "vitest";
import type { CommandResult, CommandRunner } from "../src/kind.js";
import { feishuSource } from "../src/feishu.js";
import { githubSource } from "../src/github.js";

function runner(answers: Record<string, CommandResult>): CommandRunner {
  return {
    async run(command, args) {
      const key = [command, ...args].join(" ");
      for (const [prefix, result] of Object.entries(answers)) {
        if (key.startsWith(prefix)) return result;
      }
      throw new Error(`unexpected command: ${key}`);
    },
  };
}

const signal = new AbortController().signal;

describe("github source", () => {
  const config = githubSource.parseConfig({
    enabled: true,
    repository: "acme/widgets",
    cli: "gh",
  });

  it("translates notifications into stable triggers and ignores other repos", async () => {
    const result = await githubSource.poll(
      { config, cursor: undefined },
      runner({
        "gh api /notifications": {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify([
            {
              id: "1",
              reason: "mention",
              updated_at: "2026-11-01T00:00:00Z",
              repository: { full_name: "acme/widgets" },
              subject: {
                title: "Flaky test",
                url: "https://api.github.com/repos/acme/widgets/issues/12",
                type: "Issue",
              },
            },
            {
              id: "2",
              reason: "mention",
              repository: { full_name: "other/repo" },
              subject: { url: "https://api.github.com/repos/other/repo/issues/1" },
            },
          ]),
        },
      }),
      signal,
    );
    expect(result.triggers).toHaveLength(1);
    const trigger = result.triggers[0]!;
    expect(trigger.threads).toEqual(["github:acme/widgets:issue:12"]);
    expect(trigger.addressed).toBe("mention");
    expect(trigger.channel.anchor).toBe("12");
    expect(result.skipped).toBe(1);
  });

  it("reports CI notifications as non-human", async () => {
    const result = await githubSource.poll(
      { config, cursor: undefined },
      runner({
        "gh api /notifications": {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify([
            {
              id: "3",
              reason: "ci_activity",
              updated_at: "2026-11-01T00:00:00Z",
              repository: { full_name: "acme/widgets" },
              subject: {
                url: "https://api.github.com/repos/acme/widgets/pulls/7",
                type: "PullRequest",
              },
            },
          ]),
        },
      }),
      signal,
    );
    expect(result.triggers[0]?.human).toBe(false);
    expect(result.triggers[0]?.threads).toEqual(["github:acme/widgets:pull:7"]);
  });

  it("sends comments and maps 404 to gone", async () => {
    const baseTrigger = (
      await githubSource.poll(
        { config, cursor: undefined },
        runner({
          "gh api /notifications": {
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify([
              {
                id: "4",
                reason: "mention",
                updated_at: "2026-11-01T00:00:00Z",
                repository: { full_name: "acme/widgets" },
                subject: {
                  url: "https://api.github.com/repos/acme/widgets/issues/9",
                  type: "Issue",
                },
              },
            ]),
          },
        }),
        signal,
      )
    ).triggers[0]!;

    await expect(
      githubSource.send(
        { trigger: baseTrigger, config, text: "on it", key: "k1" },
        runner({ "gh issue comment": { exitCode: 0, stdout: "", stderr: "" } }),
        signal,
      ),
    ).resolves.toBe("sent");

    await expect(
      githubSource.send(
        { trigger: baseTrigger, config, text: "on it", key: "k1" },
        runner({ "gh issue comment": { exitCode: 1, stdout: "", stderr: "HTTP 404: Not Found" } }),
        signal,
      ),
    ).resolves.toBe("gone");
  });
});

describe("feishu source", () => {
  const config = feishuSource.parseConfig({
    enabled: true,
    cli: "lark-cli",
    chats: [{ chatId: "oc_1", name: "ops", listen: "all" }],
  });

  it("only listens to configured chats and observes all messages in them", () => {
    const base = {
      id: "feishu:oc_1:m1",
      source: "feishu",
      threads: ["feishu:oc_1:m1"],
      actor: "ou_alice",
      human: true,
      text: "hi",
      at: 1,
      channel: { conversation: "oc_1", anchor: "m1" },
    };
    expect(feishuSource.scope(base, config)).toEqual({
      listened: true,
      observed: true,
      row: "oc_1",
    });
    expect(
      feishuSource.scope({ ...base, channel: { conversation: "oc_other", anchor: "m2" } }, config),
    ).toEqual({ listened: false, observed: false, reason: "chat_not_listened" });
  });

  it("translates polled items and advances the cursor", async () => {
    const result = await feishuSource.poll(
      { config, cursor: "c0" },
      runner({
        "lark-cli poll": {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            items: [
              {
                id: "m2",
                chat_id: "oc_1",
                root_id: "m1",
                sender: { id: "ou_bob", type: "user" },
                text: "please fix",
                create_time: 100,
                mentions_me: true,
              },
            ],
            next: "c1",
          }),
        },
      }),
      signal,
    );
    expect(result.cursor).toBe("c1");
    expect(result.triggers[0]?.threads).toEqual(["feishu:oc_1:m1"]);
    expect(result.triggers[0]?.addressed).toBe("mention");
  });

  it("maps a recalled message to gone", async () => {
    const trigger = {
      id: "feishu:oc_1:m1",
      source: "feishu",
      threads: ["feishu:oc_1:m1"],
      actor: "ou_alice",
      human: true,
      text: "hi",
      at: 1,
      channel: { conversation: "oc_1", anchor: "m1" },
    };
    await expect(
      feishuSource.send(
        { trigger, config, text: "ok", key: "k" },
        runner({ "lark-cli reply": { exitCode: 1, stdout: "", stderr: "message recalled (gone)" } }),
        signal,
      ),
    ).resolves.toBe("gone");
  });
});
