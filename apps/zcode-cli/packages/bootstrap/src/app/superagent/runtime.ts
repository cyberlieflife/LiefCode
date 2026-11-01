import {
  SuperAgentEngine,
  LaterError,
  computePolicyVersion,
  defaultSuperAgentSettings,
  gate,
  type Assessor,
  type EffectKind,
  type EffectRecord,
  type ExecutorPort,
  type HealthEntry,
  type PromptConfig,
  type SourcePort,
  type SourceSettings,
  type SuperAgentSettings,
  type SuperAgentStore,
  type Ticket,
  type Trigger,
} from "@zcode/superagent";
import {
  defaultSourceRegistry,
  type CommandRunner,
  type SourceRegistry,
} from "@zcode/superagent-sources";
import {
  DEFAULT_PROMPT_SECTIONS,
  loadPromptConfig,
  promptHistory,
  savePromptConfig,
  validatePromptConfig,
} from "./prompts.js";
import { createRuleBasedAssessor } from "./assessor.js";

const PASS_INTERVAL_MS = 2_000;
const POLL_INTERVAL_MS = 20_000;
const LEASE_TTL_MS = 60_000;
const MAX_SETTINGS_CHARS = 120_000;

export interface SuperAgentRuntimeOptions {
  store: SuperAgentStore;
  workspaceKey: string;
  ownerId: string;
  executionRoot: string;
  runner: CommandRunner;
  /** 把需要人处理的消息送进路由会话。 */
  relay: (text: string) => void;
  assessor?: Assessor;
  executor?: ExecutorPort;
  outbox?: SourcePort;
  registry?: SourceRegistry;
  clock?: { now(): number };
  logger?: { info(event: string, data?: unknown): void; warn(event: string, data?: unknown): void };
  passIntervalMs?: number;
  pollIntervalMs?: number;
}

export interface SuperAgentSnapshot {
  revision: number;
  workspaceKey: string;
  paused: boolean;
  policyVersion: string;
  acceptMode: string;
  rules: { id: string; name: string; instruction: string; enabled: boolean }[];
  policySettings: SuperAgentSettings["policy"];
  sourceSettings: SourceSettings;
  executorSettings: SuperAgentSettings["executor"];
  health: HealthEntry[];
  tickets: {
    id: string;
    shortName: string;
    title: string;
    stage: string;
    open: boolean;
    outcome?: string;
    directory: string;
    latestReport?: { kind: string; text?: string; question?: string; at: number };
    follows: { thread: string; own: boolean; closedAt?: number }[];
    createdAt: number;
    endedAt?: number;
  }[];
  threads: {
    key: string;
    source: string;
    subscriptions: number;
    contextTickets: number;
    triggers: number;
  }[];
  decisions: {
    id: string;
    thread: string;
    triggerIds: string[];
    outcome: string;
    reasons: { code: string; values?: string[] }[];
    at: number;
  }[];
  prompts: PromptConfig;
  promptHistory: PromptConfig[];
  overview: {
    openTickets: number;
    waitingForPerson: number;
    working: number;
    triggers24h: number;
    decisions24h: number;
  };
}

export class SuperAgentRuntime {
  private readonly store: SuperAgentStore;
  private readonly engine: SuperAgentEngine;
  private readonly options: SuperAgentRuntimeOptions;
  private readonly registry: SourceRegistry;
  private readonly assessor: Assessor;
  private readonly leaseKey: string;
  private readOnly = false;
  private started = false;
  private passTimer?: ReturnType<typeof setInterval>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private draining = false;
  private sourceFailures = new Map<string, number>();

  constructor(options: SuperAgentRuntimeOptions) {
    this.options = options;
    this.store = options.store;
    this.registry = options.registry ?? defaultSourceRegistry;
    this.assessor = options.assessor ?? createRuleBasedAssessor();
    this.leaseKey = `lease:${options.workspaceKey}`;
    this.engine = new SuperAgentEngine({
      store: options.store,
      ...(options.clock ? { clock: options.clock } : {}),
      observedThreads: (threadKey) => {
        const thread = options.store.getThread(threadKey);
        if (!thread) return false;
        const config = options.store.loadSettings()?.sources[thread.source as keyof SourceSettings];
        if (!config) return false;
        try {
          const kind = this.registry.get(thread.source);
          if (!kind) return false;
          const parsed = kind.parseConfig(config);
          const trigger = options.store.listThreadTriggers(threadKey).at(-1);
          if (!trigger) return false;
          return kind.scope(trigger, parsed).observed;
        } catch {
          return false;
        }
      },
    });
    this.ensureSettings();
  }

  private now(): number {
    return this.options.clock?.now() ?? Date.now();
  }

  private log(event: string, data?: unknown): void {
    this.options.logger?.info(event, data);
  }

  private ensureSettings(): void {
    if (this.store.loadSettings()) return;
    const settings = defaultSuperAgentSettings(this.options.executionRoot);
    settings.policy.version = computePolicyVersion(settings.policy);
    this.store.saveSettings(settings);
    this.store.setKv("settings:revision", 1);
  }

  settings(): SuperAgentSettings {
    const settings = this.store.loadSettings();
    if (!settings) throw new Error("superagent settings are missing");
    return settings;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!this.acquireLease()) {
      this.readOnly = true;
      this.setHealth("runtime", "error", "another host owns this workspace's superagent runtime");
      return;
    }
    this.setHealth("runtime", "starting");
    const passInterval = this.options.passIntervalMs ?? PASS_INTERVAL_MS;
    const pollInterval = this.options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.passTimer = setInterval(() => void this.pass(), passInterval);
    this.passTimer.unref?.();
    this.pollTimer = setInterval(() => void this.pollSources(), pollInterval);
    this.pollTimer.unref?.();
    void this.pass();
    void this.pollSources();
    this.setHealth("runtime", "ready");
    this.log("superagent.runtime.started", { workspaceKey: this.options.workspaceKey });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.passTimer) clearInterval(this.passTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.passTimer = undefined;
    this.pollTimer = undefined;
    this.releaseLease();
    this.log("superagent.runtime.stopped", { workspaceKey: this.options.workspaceKey });
  }

  get engineRef(): SuperAgentEngine {
    return this.engine;
  }

  private acquireLease(): boolean {
    const current = this.store.getKv(this.leaseKey) as { owner: string; expiresAt: number } | undefined;
    const now = this.now();
    if (current && current.owner !== this.options.ownerId && current.expiresAt > now) return false;
    this.store.setKv(this.leaseKey, { owner: this.options.ownerId, expiresAt: now + LEASE_TTL_MS });
    return true;
  }

  private renewLease(): void {
    const current = this.store.getKv(this.leaseKey) as { owner: string } | undefined;
    if (current && current.owner !== this.options.ownerId) {
      this.readOnly = true;
      return;
    }
    this.store.setKv(this.leaseKey, {
      owner: this.options.ownerId,
      expiresAt: this.now() + LEASE_TTL_MS,
    });
  }

  private releaseLease(): void {
    const current = this.store.getKv(this.leaseKey) as { owner: string } | undefined;
    if (current?.owner === this.options.ownerId) this.store.setKv(this.leaseKey, undefined);
  }

  async pass(): Promise<void> {
    if (!this.started || this.readOnly) return;
    this.renewLease();
    if (this.readOnly) {
      this.setHealth("runtime", "error", "lease lost; this host is read-only");
      return;
    }
    try {
      this.engine.evaluateDue();
    } catch (error) {
      this.setHealth("runtime", "error", String(error));
      return;
    }
    await this.drainEffects();
  }

  private async drainEffects(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const now = this.now();
      const due = this.store
        .listEffects()
        .filter((effect) => effect.nextAt <= now)
        .slice(0, 20);
      for (const effect of due) {
        await this.runEffect(effect);
      }
    } finally {
      this.draining = false;
    }
  }

  private async runEffect(effect: EffectRecord): Promise<void> {
    try {
      const done = await this.handleEffect(effect);
      if (done) {
        this.store.settleEffect(effect.id);
        this.setHealth(effect.kind, "ready");
      }
    } catch (error) {
      if (error instanceof LaterError) {
        this.store.failEffect(effect.id, effect.attempts, this.now() + 5_000);
        return;
      }
      const failures = effect.attempts + 1;
      this.log("superagent.effect.failed", {
        kind: effect.kind,
        key: effect.key,
        attempts: failures,
        error: String(error),
      });
      if (failures >= 3) {
        this.store.settleEffect(effect.id);
        this.setHealth(effect.kind, "error", String(error));
        if (effect.kind === "assessment") {
          const payload = effect.payload as { thread?: string };
          if (payload.thread) this.engine.failAssessment(payload.thread);
        }
        if (effect.kind === "launch") {
          const payload = effect.payload as { ticketId?: string };
          if (payload.ticketId) {
            this.engine.report(payload.ticketId, { kind: "failed", text: String(error) });
          }
        }
        return;
      }
      this.store.failEffect(
        effect.id,
        failures,
        this.now() + Math.min(60_000, 2 ** failures * 1_000),
      );
    }
  }

  private async handleEffect(effect: EffectRecord): Promise<boolean> {
    switch (effect.kind) {
      case "assessment": {
        const payload = effect.payload as { thread: string; triggerIds: string[] };
        const thread = this.store.getThread(payload.thread);
        if (!thread) return true;
        const triggers = payload.triggerIds
          .map((id) => this.store.getTrigger(id))
          .filter((trigger): trigger is Trigger => trigger !== undefined);
        if (triggers.length === 0) return true;
        const settings = this.settings();
        const tickets = this.store
          .listTickets()
          .filter((ticket) =>
            ticket.follows.some((follow) => follow.thread === payload.thread),
          );
        const gateResult = gate({
          trigger: triggers[0]!,
          thread,
          tickets,
          policy: settings.policy,
          observed: this.observed(thread.key, triggers[0]!),
        });
        if (gateResult.strength === "not_admitted") {
          this.engine.recordAssessment({
            threadKey: thread.key,
            triggerIds: payload.triggerIds,
            strength: gateResult.strength,
            assessment: { outcome: "ignore", matchedRuleIds: [], reasonCodes: [] },
          });
          return true;
        }
        const assessment = await this.assessor.assess({
          thread,
          triggers,
          tickets,
          rules: settings.policy.rules.filter((rule) => rule.enabled),
          policyVersion: settings.policy.version,
        });
        this.engine.recordAssessment({
          threadKey: thread.key,
          triggerIds: payload.triggerIds,
          strength: gateResult.strength,
          assessment,
        });
        return true;
      }
      case "launch": {
        const { ticketId } = effect.payload as { ticketId: string };
        const ticket = this.store.getTicket(ticketId);
        if (!ticket || !ticket.open) return true;
        // 无人值守权限必须由人显式开启；未开启时工单保持排队，不创建 Worker 会话。
        if (this.settings().executor.unattendedWorkers !== true) {
          this.setHealth("launch", "paused", "unattended workers are disabled in settings");
          throw new LaterError("unattended workers are disabled");
        }
        if (!this.options.executor) {
          this.setHealth("launch", "error", "worker executor is not configured");
          return false;
        }
        const { sessionId } = await this.options.executor.launch(ticket);
        this.engine.assignmentStarted(ticket.id, sessionId);
        this.options.relay(`工单 ${ticket.shortName} 已启动。`);
        return true;
      }
      case "delivery": {
        const { ticketId, inputIds } = effect.payload as { ticketId: string; inputIds: string[] };
        const ticket = this.store.getTicket(ticketId);
        if (!ticket || inputIds.length === 0) return true;
        if (!this.options.executor) return true;
        await this.options.executor.deliver(ticket, inputIds);
        this.engine.inputsDelivered(ticketId, inputIds);
        return true;
      }
      case "relay":
      case "notice": {
        const payload = effect.payload as { ticketId?: string; kind?: string; why?: string; triggerId?: string };
        this.relayNotice(payload);
        return true;
      }
      case "reply": {
        const payload = effect.payload as {
          triggerId?: string;
          text?: string;
          key?: string;
        };
        if (!this.options.outbox || !payload.text) return true;
        const trigger = payload.triggerId ? this.store.getTrigger(payload.triggerId) : undefined;
        if (!trigger) return true;
        const result = await this.options.outbox.send({
          source: trigger.source,
          channel: { conversation: trigger.channel.conversation, anchor: trigger.channel.anchor },
          text: payload.text,
          key: payload.key ?? `reply-${effect.id}`,
        });
        return result === "sent" || result === "gone";
      }
      case "policySync": {
        return true;
      }
    }
  }

  private relayNotice(payload: {
    ticketId?: string;
    kind?: string;
    why?: string;
    triggerId?: string;
  }): void {
    if (payload.triggerId && !payload.ticketId) {
      this.options.relay(`新候选：${payload.triggerId}`);
      return;
    }
    if (!payload.ticketId) return;
    const ticket = this.store.getTicket(payload.ticketId);
    if (!ticket) return;
    const label = `工单 ${ticket.shortName}`;
    switch (payload.kind) {
      case "ticket.created":
        this.options.relay(`${label} 已创建：${ticket.title}`);
        break;
      case "ticket.report":
        this.options.relay(`${label} 有新报告。`);
        break;
      case "ticket.ready":
        this.options.relay(`${label} 已完成，等待评审。`);
        break;
      case "ticket.blocked":
      case "ticket.failed":
        this.options.relay(`${label} 受阻：${ticket.latestReport?.text ?? "需要人工处理"}`);
        break;
      case "ticket.ended":
        this.options.relay(`${label} 已结束${payload.why ? `：${payload.why}` : ""}。`);
        break;
      case "ticket.policy_changed":
        this.options.relay(`${label} 的授权依据发生变化。`);
        break;
      default:
        this.options.relay(`${label} 状态更新。`);
    }
  }

  private observed(threadKey: string, trigger: Trigger): boolean {
    const kind = this.registry.get(trigger.source);
    if (!kind) return false;
    const settings = this.settings();
    const config = settings.sources[trigger.source as keyof SourceSettings];
    if (!config) return false;
    try {
      return kind.scope(trigger, kind.parseConfig(config)).observed;
    } catch {
      return false;
    }
  }

  async pollSources(): Promise<void> {
    if (!this.started || this.readOnly || this.settings().policy.paused) return;
    const settings = this.settings();
    for (const [kindId, rawConfig] of Object.entries(settings.sources) as [
      keyof SourceSettings,
      unknown,
    ][]) {
      if (!(rawConfig as { enabled?: boolean }).enabled) continue;
      const kind = this.registry.get(kindId);
      if (!kind) continue;
      try {
        const config = kind.parseConfig(rawConfig);
        const cursorKey = `source:${kindId}:cursor`;
        const cursor = this.store.getKv(cursorKey);
        const controller = new AbortController();
        const result = await kind.poll({ config, cursor }, this.options.runner, controller.signal);
        for (const trigger of result.triggers) {
          this.engine.receive(trigger);
        }
        if (result.cursor !== undefined) this.store.setKv(cursorKey, result.cursor);
        this.sourceFailures.set(kindId, 0);
        this.setHealth(kindId, "ready", `${result.triggers.length} new, ${result.skipped} skipped`);
      } catch (error) {
        const failures = (this.sourceFailures.get(kindId) ?? 0) + 1;
        this.sourceFailures.set(kindId, failures);
        this.log("superagent.source.poll_failed", { kind: kindId, failures, error: String(error) });
        if (failures >= 3) this.setHealth(kindId, "error", String(error));
      }
    }
  }

  private setHealth(part: string, state: HealthEntry["state"], detail?: string): void {
    this.store.setHealth({ part, state, ...(detail ? { detail } : {}), at: this.now() });
  }

  saveSettings(
    block: "policy" | "executor" | "sources",
    value: unknown,
    revision: number,
  ): { revision: number; policyChanged: boolean } {
    if (this.readOnly) throw new Error("superagent runtime is read-only");
    const currentRevision = Number(this.store.getKv("settings:revision") ?? 1);
    if (revision !== currentRevision) throw new Error(`stale settings revision: ${currentRevision}`);
    const size = JSON.stringify(value).length;
    if (size > MAX_SETTINGS_CHARS) throw new Error("settings value is too large");
    const settings = this.settings();
    const next: SuperAgentSettings = {
      ...settings,
      [block]: value,
    };
    if (block === "sources") {
      for (const kindId of ["github", "feishu"] as const) {
        const kind = this.registry.get(kindId);
        if (!kind) continue;
        kind.parseConfig(next.sources[kindId]);
      }
    }
    if (block === "policy") {
      next.policy = { ...next.policy, version: computePolicyVersion(next.policy) };
    }
    this.store.saveSettings(next);
    const nextRevision = currentRevision + 1;
    this.store.setKv("settings:revision", nextRevision);
    if (block === "policy") this.engine.policyChanged();
    return { revision: nextRevision, policyChanged: block === "policy" };
  }

  pause(paused: boolean): void {
    if (this.readOnly) throw new Error("superagent runtime is read-only");
    this.engine.setPaused(paused);
    this.setHealth("runtime", paused ? "paused" : "ready");
  }

  ticketAction(ticketId: string, action: "retry" | "stop"): void {
    if (this.readOnly) throw new Error("superagent runtime is read-only");
    if (action === "retry") {
      this.engine.retryTicket(ticketId);
      return;
    }
    this.engine.stopTicket(ticketId);
    const ticket = this.store.getTicket(ticketId);
    if (ticket && this.options.executor) {
      void this.options.executor.stop(ticket).catch((error) => {
        this.log("superagent.executor.stop_failed", { ticketId, error: String(error) });
      });
    }
  }

  reevaluate(triggerId: string): void {
    if (this.readOnly) throw new Error("superagent runtime is read-only");
    this.engine.reevaluate(triggerId);
    void this.pass();
  }

  dismiss(decisionId: string): void {
    if (this.readOnly) throw new Error("superagent runtime is read-only");
    this.engine.dismiss(decisionId);
  }

  unsubscribe(threadKey: string): void {
    if (this.readOnly) throw new Error("superagent runtime is read-only");
    this.engine.unsubscribe(threadKey);
  }

  note(ticketId: string, text: string): void {
    this.engine.note(ticketId, text);
    void this.pass();
  }

  requestStatus(ticketId: string): void {
    this.engine.requestStatus(ticketId);
  }

  prompts(): { current: PromptConfig; history: PromptConfig[] } {
    return { current: loadPromptConfig(this.store), history: promptHistory(this.store) };
  }

  savePrompts(input: {
    sections: PromptConfig["sections"];
    overrides: PromptConfig["overrides"];
    baseRevision: number;
  }): PromptConfig {
    const validation = validatePromptConfig(input, { maxChars: MAX_SETTINGS_CHARS });
    if (!validation.ok) throw new Error(validation.issues.join("; "));
    return savePromptConfig(this.store, { ...input, origin: "panel" });
  }

  defaultSections() {
    return DEFAULT_PROMPT_SECTIONS;
  }

  snapshot(): SuperAgentSnapshot {
    const state = this.engine.snapshot();
    const settings = this.settings();
    const promptConfig = loadPromptConfig(this.store);
    const now = this.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const triggers24h = state.threads.reduce(
      (total, thread) => total + this.store.listThreadTriggers(thread.key).filter((trigger) => trigger.at >= dayAgo).length,
      0,
    );
    return {
      revision: Number(this.store.getKv("settings:revision") ?? 1),
      workspaceKey: this.options.workspaceKey,
      paused: state.paused,
      policyVersion: state.policyVersion,
      acceptMode: state.acceptMode,
      rules: settings.policy.rules,
      policySettings: settings.policy,
      sourceSettings: settings.sources,
      executorSettings: settings.executor,
      health: state.health,
      tickets: state.tickets.map(({ ticket, stage }) => this.toTicketView(ticket, stage)),
      threads: state.threads.map((thread) => ({
        key: thread.key,
        source: thread.source,
        subscriptions: thread.subscriptions.length,
        contextTickets: thread.contextTicketIds.length,
        triggers: this.store.listThreadTriggers(thread.key).length,
      })),
      decisions: state.decisions.slice(0, 100).map((decision) => ({
        id: decision.id,
        thread: decision.thread,
        triggerIds: decision.triggerIds,
        outcome: decision.outcome,
        reasons: decision.reasons,
        at: decision.at,
      })),
      prompts: promptConfig,
      promptHistory: promptHistory(this.store).slice(-20),
      overview: {
        openTickets: state.tickets.filter((entry) => entry.ticket.open).length,
        waitingForPerson: state.tickets.filter((entry) => entry.ticket.open && entry.stage.startsWith("person/")).length,
        working: state.tickets.filter((entry) => entry.ticket.open && entry.stage.startsWith("working")).length,
        triggers24h,
        decisions24h: state.decisions.filter((decision) => decision.at >= dayAgo).length,
      },
    };
  }

  private toTicketView(ticket: Ticket, stage: string): SuperAgentSnapshot["tickets"][number] {
    return {
      id: ticket.id,
      shortName: ticket.shortName,
      title: ticket.title,
      stage,
      open: ticket.open,
      ...(ticket.outcome ? { outcome: ticket.outcome } : {}),
      directory: ticket.execution.directory,
      ...(ticket.latestReport
        ? {
            latestReport: {
              kind: ticket.latestReport.kind,
              ...(ticket.latestReport.text ? { text: ticket.latestReport.text } : {}),
              ...(ticket.latestReport.question ? { question: ticket.latestReport.question } : {}),
              at: ticket.latestReport.at,
            },
          }
        : {}),
      follows: ticket.follows.map((follow) => ({
        thread: follow.thread,
        own: follow.own,
        ...(follow.closedAt ? { closedAt: follow.closedAt } : {}),
      })),
      createdAt: ticket.createdAt,
      ...(ticket.endedAt ? { endedAt: ticket.endedAt } : {}),
    };
  }
}
