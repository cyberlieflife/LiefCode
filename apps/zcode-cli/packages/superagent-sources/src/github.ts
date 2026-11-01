import type { GithubSourceSettings, Trigger } from "@zcode/superagent";
import type { CommandRunner, SourceContextMessage, SourceKind, SourceScopeResult } from "./kind.js";

interface GithubNotification {
  id: string;
  reason?: string;
  updated_at?: string;
  repository?: { full_name?: string };
  subject?: { title?: string; url?: string; type?: string };
}

interface GithubIssue {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  user?: { login?: string; type?: string };
  pull_request?: unknown;
}

function parseNotifications(stdout: string): GithubNotification[] {
  try {
    const value = JSON.parse(stdout);
    return Array.isArray(value) ? (value as GithubNotification[]) : [];
  } catch {
    return [];
  }
}

function parseIssues(stdout: string): GithubIssue[] {
  try {
    const value = JSON.parse(stdout);
    return Array.isArray(value) ? (value as GithubIssue[]) : [];
  } catch {
    return [];
  }
}

function numberFromUrl(url: string | undefined): string | undefined {
  const match = url?.match(/\/(?:issues|pulls|pull)\/(\d+)(?:$|[/?#])/u);
  return match?.[1];
}

function htmlUrl(url: string | undefined): string | undefined {
  return url?.replace("https://api.github.com/repos/", "https://github.com/");
}

function triggerFromNotification(
  notification: GithubNotification,
  repository: string,
): Trigger | undefined {
  const repo = notification.repository?.full_name;
  if (repo !== repository) return undefined;
  const number = numberFromUrl(notification.subject?.url);
  if (!number) return undefined;
  const type = notification.subject?.type === "PullRequest" ? "pull" : "issue";
  const reason = notification.reason ?? "";
  const addressed =
    reason.includes("mention") || reason === "review_requested" ? ("mention" as const) : undefined;
  const id = `${repo}:${type}:${number}:${notification.updated_at ?? notification.id}`;
  return {
    id,
    source: "github",
    threads: [`github:${repo}:${type}:${number}`],
    actor: "github-notification",
    // 通知本身不带 sender；CI 与 bot 的推断由 reason 表达，不能当成人的显式请求。
    human: reason !== "ci_activity" && reason !== "security_alert",
    ...(addressed ? { addressed } : {}),
    text: notification.subject?.title ?? "",
    at: Date.parse(notification.updated_at ?? "") || Date.now(),
    channel: {
      conversation: repo,
      anchor: number,
      ...(htmlUrl(notification.subject?.url) ? { url: htmlUrl(notification.subject?.url) } : {}),
    },
    meta: { reason, type, notificationId: notification.id },
  };
}

function triggerFromIssue(issue: GithubIssue, repository: string): Trigger {
  const type = issue.pull_request ? "pull" : "issue";
  return {
    id: `${repository}:${type}:${issue.number}:${issue.updated_at}`,
    source: "github",
    threads: [`github:${repository}:${type}:${issue.number}`],
    actor: issue.user?.login ?? "unknown",
    human: issue.user?.type !== "Bot",
    text: issue.title,
    at: Date.parse(issue.updated_at) || Date.now(),
    channel: {
      conversation: repository,
      anchor: String(issue.number),
      url: issue.html_url,
    },
    meta: { type },
  };
}

/** GitHub Source：通知轮询 + 可选的仓库范围事件。 */
export const githubSource: SourceKind<GithubSourceSettings> = {
  kind: "github",
  title: "GitHub",
  description: "Listen to issues, pull requests, comments and CI results through the gh CLI.",
  parseConfig(value) {
    const config = value as Partial<GithubSourceSettings> | undefined;
    if (!config || typeof config.repository !== "string" || !config.repository.includes("/")) {
      throw new Error("github.repository must be owner/name");
    }
    return {
      enabled: config.enabled === true,
      repository: config.repository,
      cli: config.cli?.trim() || "gh",
      observeIssues: config.observeIssues === true,
      observePulls: config.observePulls === true,
      observeComments: config.observeComments === true,
      observeCi: config.observeCi === true,
    };
  },
  scope(trigger): SourceScopeResult {
    return { listened: true, observed: true, row: trigger.channel.conversation };
  },
  async poll({ config, cursor }, runner, signal) {
    const triggers: Trigger[] = [];
    let skipped = 0;
    const result = await runner.run(config.cli, ["api", "/notifications"], {
      signal,
    });
    if (result.exitCode !== 0) {
      throw new Error(`gh notifications failed: ${result.stderr.trim() || result.exitCode}`);
    }
    for (const notification of parseNotifications(result.stdout)) {
      const trigger = triggerFromNotification(notification, config.repository);
      if (trigger) triggers.push(trigger);
      else skipped += 1;
    }

    if (config.observeIssues || config.observePulls || config.observeComments) {
      const since = typeof cursor === "string" ? cursor : undefined;
      const args = [
        "api",
        `repos/${config.repository}/issues?state=all&sort=updated&direction=desc&per_page=30`,
        ...(since ? ["--method", "GET", "-f", `since=${since}`] : []),
      ];
      const issues = await runner.run(config.cli, args, { signal });
      if (issues.exitCode === 0) {
        for (const issue of parseIssues(issues.stdout)) {
          if (issue.pull_request && !config.observePulls) continue;
          if (!issue.pull_request && !config.observeIssues) continue;
          triggers.push(triggerFromIssue(issue, config.repository));
        }
      } else {
        skipped += 1;
      }
    }

    const next = new Date().toISOString();
    return { triggers, cursor: next, skipped };
  },
  async readThreadContext({ trigger, config }, runner, signal) {
    const result = await runner.run(
      config.cli,
      [
        "issue",
        "view",
        trigger.channel.anchor,
        "--repo",
        config.repository,
        "--json",
        "title,body,comments",
      ],
      { signal },
    );
    if (result.exitCode !== 0) return { messages: [] };
    try {
      const value = JSON.parse(result.stdout) as {
        title?: string;
        body?: string;
        comments?: { id?: string; author?: { login?: string }; body?: string; createdAt?: string }[];
      };
      const messages: SourceContextMessage[] = [];
      if (value.body) {
        messages.push({
          id: "body",
          from: trigger.actor,
          at: trigger.at,
          text: value.body,
        });
      }
      for (const comment of value.comments ?? []) {
        messages.push({
          id: comment.id ?? "comment",
          from: comment.author?.login ?? "unknown",
          at: Date.parse(comment.createdAt ?? "") || trigger.at,
          text: comment.body ?? "",
        });
      }
      return { messages };
    } catch {
      return { messages: [] };
    }
  },
  async send({ trigger, config, text }, runner, signal) {
    const type = trigger.meta?.type === "pull" ? "pr" : "issue";
    const result = await runner.run(
      config.cli,
      [type, "comment", trigger.channel.anchor, "--repo", config.repository, "--body", text],
      { signal },
    );
    if (result.exitCode === 0) return "sent";
    // gh 对已删除/无权限对象返回 404 消息；只在这种永久失败上返回 gone。
    if (/not found|could not resolve|HTTP 404/iu.test(result.stderr)) return "gone";
    throw new Error(`gh comment failed: ${result.stderr.trim() || result.exitCode}`);
  },
};
