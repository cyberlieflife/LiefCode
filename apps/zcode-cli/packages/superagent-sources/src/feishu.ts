import type { FeishuSourceSettings, Trigger } from "@zcode/superagent";
import type { CommandRunner, SourceContextMessage, SourceKind, SourceScopeResult } from "./kind.js";

interface FeishuItem {
  id: string;
  chat_id: string;
  root_id?: string;
  sender?: { id?: string; type?: string };
  text?: string;
  create_time?: number | string;
  url?: string;
  mentions_me?: boolean;
  direct?: boolean;
}

function parseItems(stdout: string): { items: FeishuItem[]; next?: string } {
  try {
    const value = JSON.parse(stdout) as { items?: FeishuItem[]; next?: string };
    return { items: value.items ?? [], next: value.next };
  } catch {
    return { items: [] };
  }
}

function itemAt(item: FeishuItem): number {
  const raw = item.create_time;
  if (typeof raw === "number") return raw;
  const parsed = Date.parse(String(raw ?? ""));
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function triggerFromItem(item: FeishuItem): Trigger {
  const root = item.root_id ?? item.id;
  return {
    id: `feishu:${item.chat_id}:${item.id}`,
    source: "feishu",
    threads: [`feishu:${item.chat_id}:${root}`],
    actor: item.sender?.id ?? "unknown",
    human: item.sender?.type !== "bot",
    ...(item.mentions_me ? { addressed: "mention" as const } : {}),
    text: item.text ?? "",
    at: itemAt(item),
    channel: {
      conversation: item.chat_id,
      anchor: item.id,
      ...(item.url ? { url: item.url } : {}),
    },
    meta: { root, direct: item.direct === true },
  };
}

/**
 * 飞书 Source 通过一个兼容的 CLI 适配层工作：
 * `poll --chat <id> --after <cursor> --json`、`reply --message <id> --key <k> --text <t>`、
 * `thread --chat <id> --root <id> --json`。团队可以用自己的 lark 包装脚本满足这个契约。
 */
export const feishuSource: SourceKind<FeishuSourceSettings> = {
  kind: "feishu",
  title: "Feishu",
  description: "Listen to Feishu chats through a small lark-cli compatible wrapper.",
  parseConfig(value) {
    const config = value as Partial<FeishuSourceSettings> | undefined;
    return {
      enabled: config?.enabled === true,
      cli: config?.cli?.trim() || "lark-cli",
      chats: Array.isArray(config?.chats)
        ? config.chats.map((chat) => ({
            chatId: String(chat.chatId),
            name: String(chat.name ?? chat.chatId),
            listen: chat.listen === "all" ? "all" : "mentions",
          }))
        : [],
      directMessages: config?.directMessages === true,
      otherChats: config?.otherChats === "mentions" ? "mentions" : "none",
    };
  },
  scope(trigger, config): SourceScopeResult {
    const chatId = trigger.channel.conversation;
    const configured = config.chats.find((chat) => chat.chatId === chatId);
    if (configured) {
      return {
        listened: true,
        observed: configured.listen === "all",
        row: chatId,
      };
    }
    if (trigger.meta?.direct === true && config.directMessages) {
      return { listened: true, observed: true, row: "direct" };
    }
    if (config.otherChats === "mentions" && trigger.addressed) {
      return { listened: true, observed: false, row: "other" };
    }
    return { listened: false, observed: false, reason: "chat_not_listened" };
  },
  async poll({ config, cursor }, runner, signal) {
    const triggers: Trigger[] = [];
    let skipped = 0;
    let next: string | undefined = typeof cursor === "string" ? cursor : undefined;
    for (const chat of config.chats) {
      const args = ["poll", "--chat", chat.chatId, "--json"];
      if (cursor) args.push("--after", String(cursor));
      const result = await runner.run(config.cli, args, { signal });
      if (result.exitCode !== 0) {
        skipped += 1;
        continue;
      }
      const page = parseItems(result.stdout);
      if (page.next) next = page.next;
      for (const item of page.items) {
        if (!item.id || !item.chat_id) {
          skipped += 1;
          continue;
        }
        triggers.push(triggerFromItem(item));
      }
    }
    return { triggers, cursor: next, skipped };
  },
  async readThreadContext({ trigger, config }, runner, signal) {
    const result = await runner.run(
      config.cli,
      [
        "thread",
        "--chat",
        trigger.channel.conversation,
        "--root",
        String(trigger.meta?.root ?? trigger.channel.anchor),
        "--json",
      ],
      { signal },
    );
    if (result.exitCode !== 0) return { messages: [] };
    const page = parseItems(result.stdout);
    const messages: SourceContextMessage[] = page.items.map((item) => ({
      id: item.id,
      from: item.sender?.id ?? "unknown",
      at: itemAt(item),
      text: item.text ?? "",
      ...(item.sender?.type === "bot" ? { bot: true } : {}),
      ...(item.url ? { url: item.url } : {}),
    }));
    return { messages, ...(page.next ? { next: page.next } : {}) };
  },
  async send({ trigger, config, text, key }, runner, signal) {
    const result = await runner.run(
      config.cli,
      [
        "reply",
        "--message",
        trigger.channel.anchor,
        "--key",
        key,
        "--text",
        text,
      ],
      { signal },
    );
    if (result.exitCode === 0) return "sent";
    if (/gone|recalled|deleted|410/iu.test(result.stderr)) return "gone";
    throw new Error(`feishu reply failed: ${result.stderr.trim() || result.exitCode}`);
  },
};
