import type {
  AssessmentResult,
  Decision,
  DecisionOutcome,
  DecisionReason,
  Eval,
  HealthEntry,
  InputKind,
  Mandate,
  PolicyState,
  ReportKind,
  Strength,
  SuperAgentSettings,
  Thread,
  Ticket,
  TicketInput,
  TicketReport,
  Trigger,
} from "./types.js";
import type { Clock, SuperAgentStore } from "./ports.js";
import { systemClock } from "./ports.js";
import {
  admitsInferred,
  assessmentOutcome,
  computePolicyVersion,
  enabledRuleIds,
  gate,
  isRuleEnabled,
  revalidateMandate,
} from "./policy.js";
import { reason } from "./reasons.js";
import { deriveTicketStage, isFollowupOwner } from "./stage.js";

const UNKNOWN_TICKET = "unknown ticket";

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

export interface EngineOptions {
  store: SuperAgentStore;
  clock?: Clock;
  /** 来源是否接收该 Thread 的全部消息；未登记时按只看点名处理。 */
  observedThreads?: (threadKey: string) => boolean;
}

export interface ReceiveResult {
  status: "stored" | "duplicate" | "filtered";
  threadKeys: string[];
  /** 被扇出到哪些 Ticket；为空表示进入 Eval。 */
  routedTicketIds: string[];
}

export interface PanelTicketView {
  ticket: Ticket;
  stage: ReturnType<typeof deriveTicketStage>;
}

export class SuperAgentEngine {
  private readonly store: SuperAgentStore;
  private readonly clock: Clock;
  private readonly observedThreads: (threadKey: string) => boolean;

  constructor(options: EngineOptions) {
    this.store = options.store;
    this.clock = options.clock ?? systemClock;
    this.observedThreads = options.observedThreads ?? (() => false);
  }

  private now(): number {
    return this.clock.now();
  }

  private settings(): SuperAgentSettings {
    const stored = this.store.loadSettings();
    if (stored) return stored;
    throw new Error("SuperAgent settings are not initialized");
  }

  private policy(): PolicyState {
    return this.settings().policy;
  }

  private nextId(prefix: string): string {
    const key = `seq:${prefix}`;
    const current = Number(this.store.getKv(key) ?? 0) + 1;
    this.store.setKv(key, current);
    return `${prefix}_${current.toString(36)}`;
  }

  private ensureThread(key: string, source: string): Thread {
    const existing = this.store.getThread(key);
    if (existing) return existing;
    const thread: Thread = {
      key,
      source,
      contextTicketIds: [],
      subscriptions: [],
      expiredEvals: 0,
      createdAt: this.now(),
    };
    this.store.saveThread(thread);
    return thread;
  }

  /** 入域：去重、建 Thread、扇出订阅、其余排队等待 Eval。 */
  receive(trigger: Trigger): ReceiveResult {
    if (this.store.getTrigger(trigger.id)) {
      return { status: "duplicate", threadKeys: trigger.threads, routedTicketIds: [] };
    }
    const threadKeys = trigger.threads.length > 0 ? trigger.threads : [`${trigger.source}:${trigger.channel.anchor}`];
    this.store.saveTrigger({ ...trigger, threads: threadKeys });

    const routed: string[] = [];
    for (const threadKey of threadKeys) {
      const thread = this.ensureThread(threadKey, trigger.source);
      for (const subscription of thread.subscriptions) {
        const ticket = this.store.getTicket(subscription.ticketId);
        if (!ticket) continue;
        if (subscription.ticketId !== ticket.id) continue;
        const delivered = this.deliverToTicket(ticket, {
          kind: "trigger",
          triggerId: trigger.id,
          human: trigger.human,
          text: trigger.text,
          at: trigger.at,
        });
        if (delivered) routed.push(ticket.id);
      }
      if (trigger.human && routed.length > 0) continue;
      this.queueEval(threadKey, trigger.id);
    }

    return { status: "stored", threadKeys, routedTicketIds: routed };
  }

  private deliverToTicket(
    ticket: Ticket,
    input: { kind: InputKind; triggerId?: string; human: boolean; text?: string; at: number },
  ): boolean {
    if (!ticket.open) {
      // 只有人的消息能恢复已结束 Ticket；Bots 与 CI 不唤醒。
      if (!input.human) return false;
      if (ticket.outcome === "stopped" || ticket.outcome === "mode_switched") return false;
      if (!revalidateMandate(ticket.mandate, this.policy(), { allowlisted: true, botListed: false, threadListened: true })) {
        return false;
      }
      ticket.open = true;
      ticket.outcome = undefined;
      ticket.endedAt = undefined;
    }
    const record: TicketInput = {
      id: this.nextId("input"),
      kind: input.kind,
      at: input.at,
      human: input.human,
      ...(input.text ? { text: input.text } : {}),
      ...(input.triggerId ? { triggerId: input.triggerId } : {}),
    };
    ticket.inputs.push(record);
    if (input.human) ticket.lastHumanInputAt = input.at;
    if (ticket.assignment?.status === "ended") {
      ticket.assignment = { sessionId: ticket.assignment.sessionId, status: "pending", startedAt: this.now() };
    }
    this.store.saveTicket(ticket);
    return true;
  }

  private queueEval(threadKey: string, triggerId: string): void {
    const now = this.now();
    const existing = this.store.getEval(threadKey);
    if (existing) {
      if (!existing.triggerIds.includes(triggerId)) existing.triggerIds.push(triggerId);
      this.store.saveEval(existing);
      return;
    }
    this.store.saveEval({
      thread: threadKey,
      triggerIds: [triggerId],
      startedAt: now,
      deadlineAt: now + this.policy().evalTimeoutSeconds * 1000,
      attempts: 0,
    });
  }

  /** 到期扫描：队首 Eval 进入评估，待派工 Ticket 进入 launch，未投递 Input 进入 delivery。 */
  evaluateDue(): void {
    const now = this.now();
    const policy = this.policy();
    if (!policy.paused) {
      for (const evalRecord of this.store.listEvals()) {
        if (evalRecord.deliveredAt !== undefined) continue;
        if (evalRecord.triggerIds.length === 0) {
          this.store.deleteEval(evalRecord.thread);
          continue;
        }
        if (now >= evalRecord.deadlineAt) {
          if (evalRecord.attempts >= 2 || evalRecord.dismissed) {
            this.finishEval(evalRecord.thread, "unavailable", [reason("timeout")]);
            continue;
          }
          evalRecord.attempts += 1;
          evalRecord.deadlineAt = now + policy.evalTimeoutSeconds * 1000;
          this.store.saveEval(evalRecord);
        }
        this.enqueueOnce("assessment", `assessment:${evalRecord.thread}`, {
          thread: evalRecord.thread,
          triggerIds: [...evalRecord.triggerIds],
        });
        // 已交给评估 effect：重复 passes 不再排第二条，失败由 effect 自身退避重试。
        if (evalRecord.deliveredAt === undefined) {
          evalRecord.deliveredAt = now;
          this.store.saveEval(evalRecord);
        }
      }
    }

    for (const ticket of this.store.listTickets()) {
      if (!ticket.open) continue;
      if (!ticket.assignment || ticket.assignment.status === "pending") {
        this.enqueueOnce("launch", `launch:${ticket.id}`, { ticketId: ticket.id });
        continue;
      }
      if (ticket.assignment.status === "running") {
        const pending = ticket.inputs.filter((input) => input.deliveredAt === undefined);
        if (pending.length > 0) {
          this.enqueueOnce("delivery", `delivery:${ticket.id}`, {
            ticketId: ticket.id,
            inputIds: pending.map((input) => input.id),
          });
        }
      }
    }
  }

  private enqueueOnce(kind: Parameters<SuperAgentStore["enqueueEffect"]>[0], key: string, payload: unknown): void {
    const exists = this.store
      .listEffects(kind)
      .some((effect) => effect.key === key && effect.attempts < 100);
    if (exists) return;
    this.store.enqueueEffect(kind, key, payload, this.now());
  }

  /** 评估完成：Gate 强度已在候选时确定，这里只收口模型判断。 */
  recordAssessment(input: {
    threadKey: string;
    triggerIds: string[];
    strength: Strength;
    assessment: {
      outcome: "accept" | "stop" | "ignore";
      matchedRuleIds: string[];
      reasonCodes: { code: string; values?: string[] }[];
      said?: string;
    };
  }): Decision {
    const policy = this.policy();
    const triggered = input.triggerIds
      .map((id) => this.store.getTrigger(id))
      .filter((trigger): trigger is Trigger => trigger !== undefined);
    const result: AssessmentResult = assessmentOutcome(policy, input.strength, {
      outcome: input.assessment.outcome,
      matchedRuleIds: input.assessment.matchedRuleIds,
      reasons: input.assessment.reasonCodes.map((entry) => ({
        code: entry.code,
        ...(entry.values ? { values: entry.values } : {}),
      })),
    });

    if (result.outcome === "accept") {
      if (input.strength === "explicit" || admitsInferred(policy, result.matchedRuleIds)) {
        return this.createTicket(input.threadKey, triggered, result, input.strength);
      }
      return this.finishEval(input.threadKey, "ignore", [
        ...result.reasons,
        reason("noMatchingRule"),
      ]);
    }
    return this.finishEval(
      input.threadKey,
      result.outcome === "stop" ? "stop" : "ignore",
      result.reasons,
    );
  }

  /** 评估器连续失败：记录 unavailable 并释放该批 Trigger，等待人工重新评估。 */
  failAssessment(threadKey: string): Decision {
    return this.finishEval(threadKey, "unavailable", [reason("timeout")]);
  }

  private finishEval(
    threadKey: string,
    outcome: DecisionOutcome,
    reasons: DecisionReason[],
    ruleIds: string[] = [],
  ): Decision {
    const evalRecord = this.store.getEval(threadKey);
    const triggerIds = evalRecord?.triggerIds ?? [];
    this.store.deleteEval(threadKey);
    const decision: Decision = {
      id: this.nextId("decision"),
      thread: threadKey,
      triggerIds,
      outcome,
      reasons,
      ruleIds,
      at: this.now(),
    };
    this.store.saveDecision(decision);
    return decision;
  }

  private createTicket(
    threadKey: string,
    triggers: Trigger[],
    result: AssessmentResult,
    strength: Strength,
  ): Decision {
    const origin = triggers[0];
    const now = this.now();
    const seed = origin?.id ?? threadKey;
    const shortName = `sa-${shortHash(seed)}`;
    const settings = this.settings();
    const ticketId = this.nextId("ticket");
    const mandate: Mandate = {
      policyVersion: this.policy().version,
      strength,
      ruleIds: result.matchedRuleIds,
      scope: [threadKey],
      sender: origin?.actor ?? "",
      basis: origin?.human ? "admission" : "bot",
    };
    const ticket: Ticket = {
      id: ticketId,
      shortName,
      title: (origin?.text ?? threadKey).slice(0, 80),
      open: true,
      origin: {
        triggerId: origin?.id ?? "",
        triggerIds: triggers.map((trigger) => trigger.id),
        strength,
        ruleIds: result.matchedRuleIds,
        basis: mandate.basis,
      },
      mandate,
      execution: {
        name: shortName,
        directory: `${settings.executor.executionRoot.replace(/[\\/]+$/, "")}/${shortName}`,
      },
      assignment: { sessionId: "", status: "pending", startedAt: now },
      follows: [{ thread: threadKey, own: true }],
      inputs: triggers.map((trigger) => ({
        id: this.nextId("input"),
        kind: "trigger" as const,
        at: trigger.at,
        human: trigger.human,
        text: trigger.text,
        triggerId: trigger.id,
      })),
      createdAt: now,
    };
    this.store.saveTicket(ticket);

    const thread = this.ensureThread(threadKey, origin?.source ?? "unknown");
    if (!thread.subscriptions.some((entry) => entry.ticketId === ticketId)) {
      thread.subscriptions.push({ ticketId, own: true });
      this.store.saveThread(thread);
    }

    this.store.enqueueEffect("launch", `launch:${ticketId}`, { ticketId }, now);
    this.store.enqueueEffect(
      "notice",
      `notice:created:${ticketId}`,
      { ticketId, kind: "ticket.created" },
      now,
    );
    const decision: Decision = {
      id: this.nextId("decision"),
      thread: threadKey,
      triggerIds: ticket.origin.triggerIds,
      outcome: "accept",
      reasons: [reason("startedTicket", [shortName]), ...result.reasons],
      ruleIds: result.matchedRuleIds,
      at: now,
    };
    this.store.saveDecision(decision);
    this.store.deleteEval(threadKey);
    return decision;
  }

  /** 面板/路由会话的显式决定（尚未经过 Assessment 的候选）。 */
  decide(triggerId: string, outcome: DecisionOutcome): Decision {
    const trigger = this.store.getTrigger(triggerId);
    const threadKey = trigger?.threads[0];
    if (!trigger || !threadKey) throw new Error(`trigger not found: ${triggerId}`);
    const evalRecord = this.store.getEval(threadKey);
    if (!evalRecord || !evalRecord.triggerIds.includes(triggerId)) {
      throw new Error(`trigger has no pending evaluation: ${triggerId}`);
    }
    if (outcome === "accept") {
      const threads = trigger.threads;
      const existing = this.store
        .listTickets()
        .filter((ticket) => ticket.open && ticket.follows.some((follow) => threads.includes(follow.thread)));
      if (existing.length > 0) throw new Error("trigger already routed to an open ticket");
      const gateResult = gate({
        trigger,
        thread: this.ensureThread(threadKey, trigger.source),
        tickets: [],
        policy: this.policy(),
        observed: this.observedThreads(threadKey),
      });
      if (gateResult.strength === "not_admitted") throw new Error("trigger is not admitted");
      return this.createTicket(
        threadKey,
        [trigger],
        { outcome: "accept", matchedRuleIds: [], reasons: [] },
        gateResult.strength,
      );
    }
    return this.finishEval(threadKey, outcome, [reason(outcome === "stop" ? "stoppedByPerson" : "noMatchingRule")]);
  }

  attach(ticketId: string, triggerId: string, note?: string): void {
    const ticket = this.requireTicket(ticketId);
    const trigger = this.store.getTrigger(triggerId);
    if (!trigger) throw new Error(`trigger not found: ${triggerId}`);
    this.deliverToTicket(ticket, {
      kind: "trigger",
      triggerId,
      human: trigger.human,
      text: trigger.text,
      at: trigger.at,
    });
    if (note) {
      this.deliverToTicket(ticket, { kind: "text", human: true, text: note, at: this.now() });
    }
    for (const threadKey of trigger.threads) {
      const thread = this.ensureThread(threadKey, trigger.source);
      if (!thread.subscriptions.some((entry) => entry.ticketId === ticketId)) {
        thread.subscriptions.push({ ticketId, own: false });
        this.store.saveThread(thread);
      }
      this.store.deleteEval(threadKey);
    }
    this.store.enqueueEffect("delivery", `delivery:${ticketId}:${triggerId}`, {
      ticketId,
      inputIds: ticket.inputs.filter((input) => input.deliveredAt === undefined).map((input) => input.id),
    }, this.now());
  }

  note(ticketId: string, text: string): void {
    const ticket = this.requireTicket(ticketId);
    this.deliverToTicket(ticket, { kind: "text", human: true, text, at: this.now() });
    this.store.enqueueEffect("delivery", `delivery:note:${ticketId}`, {
      ticketId,
      inputIds: ticket.inputs.filter((input) => input.deliveredAt === undefined).map((input) => input.id),
    }, this.now());
  }

  requestStatus(ticketId: string): void {
    this.note(ticketId, "Please report your current status.");
  }

  assignmentStarted(ticketId: string, sessionId: string): void {
    const ticket = this.requireTicket(ticketId);
    ticket.assignment = { sessionId, status: "running", startedAt: this.now() };
    this.store.saveTicket(ticket);
  }

  inputsDelivered(ticketId: string, inputIds: string[]): void {
    const ticket = this.requireTicket(ticketId);
    const now = this.now();
    for (const input of ticket.inputs) {
      if (inputIds.includes(input.id)) input.deliveredAt = now;
    }
    this.store.saveTicket(ticket);
  }

  inputsRead(ticketId: string, inputIds: string[]): void {
    const ticket = this.requireTicket(ticketId);
    const now = this.now();
    for (const input of ticket.inputs) {
      if (inputIds.includes(input.id)) input.readAt = now;
    }
    this.store.saveTicket(ticket);
  }

  deliveryFailed(ticketId: string, error: string): void {
    const ticket = this.requireTicket(ticketId);
    ticket.delivery = { error, at: this.now() };
    this.store.saveTicket(ticket);
  }

  turnEnded(ticketId: string): void {
    const ticket = this.requireTicket(ticketId);
    ticket.delivery = undefined;
    if (ticket.assignment) ticket.assignment.status = "ended";
    this.store.saveTicket(ticket);
  }

  report(ticketId: string, report: { kind: ReportKind; text?: string; question?: string }): void {
    const ticket = this.requireTicket(ticketId);
    const now = this.now();
    const entry: TicketReport = { kind: report.kind, at: now, ...(report.text ? { text: report.text } : {}), ...(report.question ? { question: report.question } : {}) };
    ticket.latestReport = entry;
    if (ticket.assignment) ticket.assignment.status = "ended";
    if (report.kind === "dropped") {
      this.endTicket(ticket, "dropped");
    } else {
      this.store.saveTicket(ticket);
    }
    this.store.enqueueEffect("notice", `notice:report:${ticket.id}:${now}`, {
      ticketId,
      kind: `ticket.${report.kind}`,
    }, now);
  }

  handback(ticketId: string, triggerId: string, why: string): void {
    const ticket = this.requireTicket(ticketId);
    ticket.inputs = ticket.inputs.filter((input) => input.triggerId !== triggerId);
    this.store.saveTicket(ticket);
    this.ensureThread(ticket.follows[0]?.thread ?? triggerId, "unknown");
    this.store.enqueueEffect("relay", `relay:handback:${ticketId}:${triggerId}`, {
      ticketId,
      triggerId,
      why,
    }, this.now());
  }

  markUnrelated(ticketId: string, threadKey: string): void {
    const ticket = this.requireTicket(ticketId);
    ticket.follows = ticket.follows.filter((follow) => follow.thread !== threadKey || follow.own);
    const thread = this.store.getThread(threadKey);
    if (thread) {
      thread.subscriptions = thread.subscriptions.filter((entry) => entry.ticketId !== ticketId);
      thread.contextTicketIds = thread.contextTicketIds.filter((id) => id !== ticketId);
      this.store.saveThread(thread);
    }
    this.store.saveTicket(ticket);
  }

  followForContext(ticketId: string, threadKey: string): void {
    const ticket = this.requireTicket(ticketId);
    if (!ticket.follows.some((follow) => follow.thread === threadKey)) {
      ticket.follows.push({ thread: threadKey, own: false });
      this.store.saveTicket(ticket);
    }
    const thread = this.ensureThread(threadKey, "unknown");
    if (!thread.contextTicketIds.includes(ticketId)) {
      thread.contextTicketIds.push(ticketId);
      this.store.saveThread(thread);
    }
  }

  stopTicket(ticketId: string, why = "stopped by a person"): void {
    const ticket = this.requireTicket(ticketId);
    ticket.outcome = "stopped";
    ticket.endedAt = this.now();
    if (ticket.assignment) ticket.assignment.status = "ended";
    this.endTicket(ticket, "stopped", why);
  }

  retryTicket(ticketId: string): void {
    const ticket = this.requireTicket(ticketId);
    if (!ticket.open) throw new Error("only open tickets can be retried");
    ticket.assignment = {
      sessionId: ticket.assignment?.sessionId ?? "",
      status: "pending",
      startedAt: this.now(),
      recoveryNote: "Retry: check the directory, git history and remote state before repeating work.",
    };
    ticket.delivery = undefined;
    this.store.saveTicket(ticket);
    this.store.enqueueEffect("launch", `launch:${ticketId}:retry:${this.now()}`, { ticketId }, this.now());
  }

  reevaluate(triggerId: string): void {
    const trigger = this.store.getTrigger(triggerId);
    if (!trigger) throw new Error(`trigger not found: ${triggerId}`);
    for (const threadKey of trigger.threads) {
      this.queueEval(threadKey, triggerId);
      const evalRecord = this.store.getEval(threadKey);
      if (evalRecord) {
        this.store.saveEval({ ...evalRecord, dismissed: false, attempts: 0, deliveredAt: undefined });
      }
    }
  }

  dismiss(decisionId: string): void {
    const decision = this.store.getDecision(decisionId);
    if (!decision) throw new Error(`decision not found: ${decisionId}`);
    const evalRecord = this.store.getEval(decision.thread);
    if (evalRecord) this.store.saveEval({ ...evalRecord, dismissed: true });
  }

  unsubscribe(threadKey: string): void {
    const thread = this.store.getThread(threadKey);
    if (!thread) return;
    thread.subscriptions = [];
    this.store.saveThread(thread);
  }

  threadClosed(threadKey: string, outcome: "merged" | "closed"): void {
    const thread = this.store.getThread(threadKey);
    if (!thread) return;
    const now = this.now();
    for (const ticket of this.store.listTickets()) {
      if (!ticket.open) continue;
      const follow = ticket.follows.find((entry) => entry.thread === threadKey);
      if (!follow) continue;
      follow.closedAt = now;
      follow.outcome = outcome;
      const stillOpen = ticket.follows.some((entry) => !entry.closedAt);
      if (!stillOpen) this.endTicket(ticket, outcome);
      else this.store.saveTicket(ticket);
    }
  }

  policyChanged(): void {
    const policy = this.policy();
    policy.version = computePolicyVersion(policy);
    const settings = this.settings();
    this.store.saveSettings({ ...settings, policy });
    for (const ticket of this.store.listTickets()) {
      if (!ticket.open) continue;
      const valid = revalidateMandate(ticket.mandate, policy, {
        allowlisted: true,
        botListed: true,
        threadListened: true,
      });
      if (!valid) {
        this.endTicket(ticket, "stopped", "policy revoked the mandate");
        continue;
      }
      const rulesChanged = ticket.mandate.ruleIds.some((ruleId) => !isRuleEnabled(policy, ruleId));
      if (rulesChanged) {
        this.store.enqueueEffect("notice", `notice:policy:${ticket.id}:${policy.version}`, {
          ticketId: ticket.id,
          kind: "ticket.policy_changed",
        }, this.now());
      }
    }
  }

  setPaused(paused: boolean): void {
    const settings = this.settings();
    this.store.saveSettings({ ...settings, policy: { ...settings.policy, paused } });
  }

  private endTicket(
    ticket: Ticket,
    outcome: NonNullable<Ticket["outcome"]>,
    why?: string,
  ): void {
    ticket.open = false;
    ticket.outcome = outcome;
    ticket.endedAt = this.now();
    if (ticket.assignment) ticket.assignment.status = "ended";
    this.store.saveTicket(ticket);
    if (why) {
      this.store.enqueueEffect("notice", `notice:ended:${ticket.id}`, {
        ticketId: ticket.id,
        kind: "ticket.ended",
        why,
      }, this.now());
    }
  }

  private requireTicket(ticketId: string): Ticket {
    const ticket = this.store.getTicket(ticketId);
    if (!ticket) throw new Error(UNKNOWN_TICKET);
    return ticket;
  }

  /** 面板快照：只读投影，不写状态。 */
  snapshot(): {
    tickets: PanelTicketView[];
    threads: Thread[];
    decisions: Decision[];
    health: HealthEntry[];
    rules: { id: string; name: string; instruction: string }[];
    policyVersion: string;
    acceptMode: PolicyState["acceptMode"];
    paused: boolean;
  } {
    const policy = this.policy();
    return {
      tickets: this.store.listTickets().map((ticket) => ({
        ticket,
        stage: deriveTicketStage(ticket),
      })),
      threads: this.store.listThreads(),
      decisions: this.store
        .listThreads()
        .flatMap((thread) => this.store.listDecisions(thread.key))
        .sort((left, right) => right.at - left.at),
      health: this.store.health(),
      rules: enabledRuleIds(policy).map((ruleId) => {
        const rule = policy.rules.find((entry) => entry.id === ruleId)!;
        return { id: rule.id, name: rule.name, instruction: rule.instruction };
      }),
      policyVersion: policy.version,
      acceptMode: policy.acceptMode,
      paused: policy.paused,
    };
  }

  /** 供 UI 判定的归属查询：某 Thread 上仍负责跟进人的 Ticket。 */
  followupOwners(threadKey: string): string[] {
    return this.store
      .listTickets()
      .filter((ticket) => isFollowupOwner(ticket, threadKey))
      .map((ticket) => ticket.id);
  }
}
