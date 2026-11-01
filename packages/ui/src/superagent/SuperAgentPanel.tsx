import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import { useSuperAgentPanel } from "./useSuperAgentPanel.js";
import { SuperAgentGuide } from "./SuperAgentGuide.js";
import type {
  SuperAgentDispatch,
  SuperAgentPromptView,
  SuperAgentSnapshotView,
  SuperAgentTicketView,
} from "./types.js";

const TABS = [
  ["overview", "总览"],
  ["sources", "来源"],
  ["triggers", "触发"],
  ["eval", "评估"],
  ["execution", "执行"],
  ["settings", "设置"],
  ["guide", "指南"],
] as const;

type TabId = (typeof TABS)[number][0];

export function SuperAgentPanel({
  agentMode,
  sessionId,
  dispatch,
}: {
  agentMode: string;
  sessionId: string | null;
  dispatch: SuperAgentDispatch;
}) {
  if (agentMode !== "superagent") return null;
  return <SuperAgentPanelInner sessionId={sessionId} dispatch={dispatch} />;
}

function SuperAgentPanelInner({
  sessionId,
  dispatch,
}: {
  sessionId: string | null;
  dispatch: SuperAgentDispatch;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const { snapshot, error, busy, refresh, run } = useSuperAgentPanel({ open, dispatch, sessionId });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 z-20 rounded-full border border-border bg-background px-3 py-1 text-ui-xs font-medium text-foreground-subtle shadow-sm hover:text-foreground"
        data-testid="superagent-panel-trigger"
      >
        SuperAgent
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-2 right-2 top-16 z-40 flex w-[460px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      data-testid="superagent-panel"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            SuperAgent
            {snapshot ? (
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-ui-xs",
                  snapshot.paused ? "bg-warning/15 text-warning" : "bg-tag text-foreground-subtle",
                )}
              >
                {snapshot.paused ? "已暂停" : "运行中"} · {snapshot.acceptMode}
              </span>
            ) : null}
          </div>
          <div className="truncate text-ui-xs text-foreground-subtle">
            {snapshot?.workspaceKey ?? "读取中"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-ui-xs text-foreground-subtle hover:text-foreground"
            disabled={busy}
            onClick={() => void run("superAgentAction", { action: snapshot?.paused ? "resume" : "pause" })}
          >
            {snapshot?.paused ? "恢复" : "暂停"}
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-ui-xs text-foreground-subtle hover:text-foreground"
            onClick={() => void refresh()}
          >
            刷新
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-ui-xs text-foreground-subtle hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            收起
          </button>
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-ui-xs",
              tab === id ? "bg-tag text-foreground" : "text-foreground-subtle hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-ui-base">
        {error ? (
          <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-ui-xs text-danger">
            {error}
          </div>
        ) : null}
        {!snapshot ? (
          tab === "guide" ? (
            <SuperAgentGuide />
          ) : (
            <div className="text-foreground-subtle">正在读取 SuperAgent 状态…</div>
          )
        ) : (
          <TabBody tab={tab} snapshot={snapshot} busy={busy} run={run} />
        )}
      </div>
    </div>
  );
}

function TabBody({
  tab,
  snapshot,
  busy,
  run,
}: {
  tab: TabId;
  snapshot: SuperAgentSnapshotView;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  switch (tab) {
    case "overview":
      return <OverviewTab snapshot={snapshot} />;
    case "sources":
      return <SourcesTab snapshot={snapshot} busy={busy} run={run} />;
    case "triggers":
      return <TriggersTab snapshot={snapshot} busy={busy} run={run} />;
    case "eval":
      return <EvalTab snapshot={snapshot} busy={busy} run={run} />;
    case "execution":
      return <ExecutionTab snapshot={snapshot} busy={busy} run={run} />;
    case "settings":
      return <SettingsTab snapshot={snapshot} busy={busy} run={run} />;
    case "guide":
      return <SuperAgentGuide />;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-ui-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
      <span className="text-foreground-subtle">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}

function OverviewTab({ snapshot }: { snapshot: SuperAgentSnapshotView }) {
  return (
    <>
      <Section title="需要你处理">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="开放工单" value={snapshot.overview.openTickets} />
          <Stat label="等待人" value={snapshot.overview.waitingForPerson} />
          <Stat label="执行中" value={snapshot.overview.working} />
          <Stat label="24h 事件" value={snapshot.overview.triggers24h} />
        </div>
      </Section>
      <Section title="系统健康">
        {snapshot.health.length === 0 ? (
          <div className="text-foreground-subtle">没有异常。</div>
        ) : (
          snapshot.health.map((entry) => (
            <Row
              key={entry.part}
              label={entry.part}
              value={
                <span className={entry.state === "error" ? "text-danger" : undefined}>
                  {entry.state}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </span>
              }
            />
          ))
        )}
      </Section>
      <Section title="最近决定">
        {snapshot.decisions.slice(0, 5).map((decision) => (
          <Row
            key={decision.id}
            label={decision.thread}
            value={`${decision.outcome} · ${new Date(decision.at).toLocaleTimeString()}`}
          />
        ))}
      </Section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-ui-xs text-foreground-subtle">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function SourcesTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: SuperAgentSnapshotView;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const github = (snapshot.sourceSettings.github ?? {}) as Record<string, unknown>;
  const feishu = (snapshot.sourceSettings.feishu ?? {}) as Record<string, unknown>;
  const repository = typeof github.repository === "string" ? github.repository : "";
  // 协议层要求 repository 为 owner/name；未配置时禁用启用按钮，避免必然失败的保存。
  const repositoryConfigured = repository.includes("/");
  return (
    <>
      <SourceCard
        title="GitHub"
        enabled={Boolean(github.enabled)}
        toggleDisabled={!repositoryConfigured}
        onToggle={(enabled) =>
          void run("superAgentSaveSettings", {
            block: "sources",
            revision: snapshot.revision,
            value: { ...snapshot.sourceSettings, github: { ...github, enabled } },
          })
        }
        busy={busy}
      >
        <Row label="仓库" value={repository || "未配置"} />
        <Row label="CLI" value={String(github.cli ?? "gh")} />
        <Row label="Issue" value={github.observeIssues ? "接收" : "仅通知"} />
        <Row label="Pull request" value={github.observePulls ? "接收" : "仅通知"} />
        {repositoryConfigured ? null : (
          <div className="mt-2 text-ui-xs text-foreground-subtle">
            先在「设置 → 来源配置」填写 repository（owner/name），再启用来源。
          </div>
        )}
      </SourceCard>
      <SourceCard
        title="飞书"
        enabled={Boolean(feishu.enabled)}
        onToggle={(enabled) =>
          void run("superAgentSaveSettings", {
            block: "sources",
            revision: snapshot.revision,
            value: { ...snapshot.sourceSettings, feishu: { ...feishu, enabled } },
          })
        }
        busy={busy}
      >
        <Row label="CLI" value={String(feishu.cli ?? "lark-cli")} />
        <Row
          label="会话"
          value={Array.isArray(feishu.chats) ? `${(feishu.chats as unknown[]).length} 个` : "0 个"}
        />
      </SourceCard>
      <div className="text-ui-xs text-foreground-subtle">
        GitHub 与飞书的详细参数在「设置 → 来源配置」的 JSON 中编辑；这里只做运行开关。
      </div>
    </>
  );
}

function SourceCard({
  title,
  enabled,
  onToggle,
  busy,
  toggleDisabled = false,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  busy: boolean;
  toggleDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Section title={title}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-foreground-subtle">{enabled ? "已启用" : "已停用"}</span>
        <button
          type="button"
          disabled={busy || toggleDisabled}
          onClick={() => onToggle(!enabled)}
          className="rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
        >
          {enabled ? "停用" : "启用"}
        </button>
      </div>
      {children}
    </Section>
  );
}

function TriggersTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: SuperAgentSnapshotView;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  if (snapshot.threads.length === 0) return <div className="text-foreground-subtle">还没有线程。</div>;
  return (
    <Section title="线程">
      {snapshot.threads.map((thread) => (
        <div key={thread.key} className="mb-2 rounded-md border border-border px-3 py-2">
          <div className="truncate font-medium">{thread.key}</div>
          <div className="text-ui-xs text-foreground-subtle">
            {thread.source} · {thread.triggers} 条事件 · {thread.subscriptions} 个订阅 ·{" "}
            {thread.contextTickets} 个上下文工单
          </div>
          {thread.subscriptions > 0 ? (
            <button
              type="button"
              disabled={busy}
              className="mt-2 rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
              onClick={() =>
                void run("superAgentAction", { action: "unsubscribe", threadKey: thread.key })
              }
            >
              取消订阅
            </button>
          ) : null}
        </div>
      ))}
    </Section>
  );
}

function EvalTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: SuperAgentSnapshotView;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  return (
    <>
      <Section title="策略">
        <Row label="版本" value={snapshot.policyVersion || "—"} />
        <Row label="接单模式" value={snapshot.acceptMode} />
        <Row label="启用规则" value={snapshot.rules.length} />
      </Section>
      <Section title="最近决定">
        {snapshot.decisions.length === 0 ? (
          <div className="text-foreground-subtle">还没有评估记录。</div>
        ) : (
          snapshot.decisions.map((decision) => (
            <div key={decision.id} className="mb-2 rounded-md border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{decision.outcome}</span>
                <span className="text-ui-xs text-foreground-subtle">
                  {new Date(decision.at).toLocaleString()}
                </span>
              </div>
              <div className="truncate text-ui-xs text-foreground-subtle">{decision.thread}</div>
              <div className="mt-1 text-ui-xs">
                {decision.reasons.map((entry) => entry.code).join(", ") || "无原因记录"}
              </div>
              {(decision.outcome === "ignore" || decision.outcome === "unavailable") &&
              decision.triggerIds[0] ? (
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
                  onClick={() =>
                    void run("superAgentAction", {
                      action: "reevaluate",
                      triggerId: decision.triggerIds[0],
                    })
                  }
                >
                  重新评估
                </button>
              ) : null}
            </div>
          ))
        )}
      </Section>
    </>
  );
}

function ExecutionTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: SuperAgentSnapshotView;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  if (snapshot.tickets.length === 0) return <div className="text-foreground-subtle">还没有工单。</div>;
  return (
    <>
      <Section title="工单">
        {snapshot.tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} busy={busy} run={run} />
        ))}
      </Section>
    </>
  );
}

function TicketCard({
  ticket,
  busy,
  run,
}: {
  ticket: SuperAgentTicketView;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  return (
    <div className="mb-2 rounded-md border border-border px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">
            {ticket.shortName} · {ticket.title}
          </div>
          <div className="text-ui-xs text-foreground-subtle">
            {ticket.stage}
            {ticket.outcome ? ` · ${ticket.outcome}` : ""}
          </div>
        </div>
        {ticket.open ? (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={busy}
              className="rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
              onClick={() =>
                void run("superAgentAction", { action: "ticket.retry", ticketId: ticket.id })
              }
            >
              重试
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
              onClick={() =>
                void run("superAgentAction", { action: "ticket.stop", ticketId: ticket.id })
              }
            >
              停止
            </button>
          </div>
        ) : null}
      </div>
      {ticket.latestReport ? (
        <div className="mt-2 rounded-sm bg-tag px-2 py-1 text-ui-xs">
          {ticket.latestReport.kind}
          {ticket.latestReport.text ? ` · ${ticket.latestReport.text}` : ""}
          {ticket.latestReport.question ? ` · 问题：${ticket.latestReport.question}` : ""}
        </div>
      ) : null}
      <div className="mt-1 truncate text-ui-xs text-foreground-subtle">{ticket.directory}</div>
    </div>
  );
}

function SettingsTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: SuperAgentSnapshotView;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const executor = snapshot.executorSettings as Record<string, unknown>;
  const [maxWorkers, setMaxWorkers] = useState(String(executor.maxWorkers ?? 2));
  const [executionRoot, setExecutionRoot] = useState(String(executor.executionRoot ?? ""));
  const [prepareCommand, setPrepareCommand] = useState(String(executor.prepareCommand ?? ""));
  const [acceptMode, setAcceptMode] = useState(snapshot.acceptMode);
  const [unattended, setUnattended] = useState(executor.unattendedWorkers === true);
  const [sections, setSections] = useState(snapshot.prompts.sections);
  const [sourcesJson, setSourcesJson] = useState(() =>
    JSON.stringify(snapshot.sourceSettings, null, 2),
  );
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  useEffect(() => {
    setMaxWorkers(String(executor.maxWorkers ?? 2));
    setExecutionRoot(String(executor.executionRoot ?? ""));
    setPrepareCommand(String(executor.prepareCommand ?? ""));
    setAcceptMode(snapshot.acceptMode);
    setUnattended(executor.unattendedWorkers === true);
    setSections(snapshot.prompts.sections);
    setSourcesJson(JSON.stringify(snapshot.sourceSettings, null, 2));
    setSourcesError(null);
  }, [snapshot.revision, snapshot.prompts.revision]);

  const executorValue = useMemo(
    () => ({
      ...executor,
      maxWorkers: Number(maxWorkers) || 1,
      executionRoot,
      prepareCommand: prepareCommand || undefined,
      unattendedWorkers: unattended,
    }),
    [executor, maxWorkers, executionRoot, prepareCommand, unattended],
  );

  const saveSources = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(sourcesJson);
    } catch (error) {
      setSourcesError(
        `来源配置不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setSourcesError("来源配置必须是包含 github 与 feishu 的对象");
      return;
    }
    setSourcesError(null);
    void run("superAgentSaveSettings", {
      block: "sources",
      revision: snapshot.revision,
      value: parsed,
    });
  };

  return (
    <>
      <Section title="来源配置">
        <label className="mb-2 block text-ui-xs text-foreground-subtle">
          sources JSON
          <textarea
            className="mt-1 min-h-[140px] w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-ui-xs"
            value={sourcesJson}
            onChange={(event) => setSourcesJson(event.target.value)}
          />
        </label>
        {sourcesError ? (
          <div className="mb-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-ui-xs text-danger">
            {sourcesError}
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
          onClick={saveSources}
        >
          保存来源配置
        </button>
      </Section>

      <Section title="执行">
        <label className="mb-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-2 text-ui-xs">
          <input
            type="checkbox"
            checked={unattended}
            onChange={(event) => setUnattended(event.target.checked)}
          />
          <span>
            允许无人值守 Worker。开启后 Worker 以当前系统账号权限执行工具，不再逐个审批；
            `blockedCommands` 只是约定，不构成安全边界。需要隔离时请使用独立系统账号。
          </span>
        </label>
        <label className="mb-2 block text-ui-xs text-foreground-subtle">
          并发 Worker 数
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-ui-base"
            value={maxWorkers}
            onChange={(event) => setMaxWorkers(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="mb-2 block text-ui-xs text-foreground-subtle">
          执行目录根
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-ui-base"
            value={executionRoot}
            onChange={(event) => setExecutionRoot(event.target.value)}
          />
        </label>
        <label className="mb-2 block text-ui-xs text-foreground-subtle">
          prepare 命令
          <textarea
            className="mt-1 min-h-[70px] w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-ui-xs"
            value={prepareCommand}
            onChange={(event) => setPrepareCommand(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
          onClick={() =>
            void run("superAgentSaveSettings", {
              block: "executor",
              revision: snapshot.revision,
              value: executorValue,
            })
          }
        >
          保存执行设置
        </button>
      </Section>

      <Section title="Policy">
        <label className="mb-2 block text-ui-xs text-foreground-subtle">
          接单模式
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-ui-base"
            value={acceptMode}
            onChange={(event) => setAcceptMode(event.target.value)}
          >
            <option value="off">off · 只处理点名请求</option>
            <option value="observe">observe · 记录但不主动接单</option>
            <option value="auto">auto · 命中规则即接单</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
          onClick={() =>
            void run("superAgentSaveSettings", {
              block: "policy",
              revision: snapshot.revision,
              value: { ...snapshot.policySettings, acceptMode },
            })
          }
        >
          保存 Policy
        </button>
      </Section>

      <Section title="提示词">
        <PromptField
          label="沟通"
          value={sections.communication}
          onChange={(communication) => setSections({ ...sections, communication })}
        />
        <PromptField
          label="工单范围"
          value={sections.ticketScope}
          onChange={(ticketScope) => setSections({ ...sections, ticketScope })}
        />
        <PromptField
          label="交付"
          value={sections.delivery}
          onChange={(delivery) => setSections({ ...sections, delivery })}
        />
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-border px-2 py-1 text-ui-xs hover:bg-tag"
          onClick={() =>
            void run("superAgentSavePrompts", {
              sections,
              overrides: snapshot.prompts.overrides as SuperAgentPromptView["overrides"],
              baseRevision: snapshot.prompts.revision,
            })
          }
        >
          保存提示词（v{snapshot.prompts.revision}）
        </button>
      </Section>
    </>
  );
}

function PromptField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mb-2 block text-ui-xs text-foreground-subtle">
      {label}
      <textarea
        className="mt-1 min-h-[64px] w-full rounded-md border border-border bg-background px-2 py-1 text-ui-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
