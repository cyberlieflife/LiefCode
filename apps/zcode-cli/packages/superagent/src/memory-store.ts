import type {
  Decision,
  Eval,
  HealthEntry,
  SuperAgentSettings,
  Thread,
  Ticket,
  Trigger,
} from "./types.js";
import type { EffectKind, EffectRecord, SuperAgentStore } from "./ports.js";

/** 内存实现：测试与纯逻辑演练用，不承担持久化。 */
export class MemorySuperAgentStore implements SuperAgentStore {
  private settings?: SuperAgentSettings;
  private triggers = new Map<string, Trigger>();
  private threads = new Map<string, Thread>();
  private tickets = new Map<string, Ticket>();
  private decisions = new Map<string, Decision>();
  private evals = new Map<string, Eval>();
  private effects = new Map<string, EffectRecord>();
  private kv = new Map<string, unknown>();
  private healthEntries = new Map<string, HealthEntry>();
  private effectSeq = 0;

  constructor(settings?: SuperAgentSettings) {
    this.settings = settings;
  }

  loadSettings(): SuperAgentSettings | undefined {
    return this.settings ? structuredClone(this.settings) : undefined;
  }

  saveSettings(settings: SuperAgentSettings): void {
    this.settings = structuredClone(settings);
  }

  getTrigger(id: string): Trigger | undefined {
    const value = this.triggers.get(id);
    return value ? structuredClone(value) : undefined;
  }

  saveTrigger(trigger: Trigger): void {
    this.triggers.set(trigger.id, structuredClone(trigger));
  }

  listThreadTriggers(threadKey: string): Trigger[] {
    return [...this.triggers.values()]
      .filter((trigger) => trigger.threads.includes(threadKey))
      .map((trigger) => structuredClone(trigger));
  }

  getThread(key: string): Thread | undefined {
    const value = this.threads.get(key);
    return value ? structuredClone(value) : undefined;
  }

  saveThread(thread: Thread): void {
    this.threads.set(thread.key, structuredClone(thread));
  }

  listThreads(): Thread[] {
    return [...this.threads.values()].map((thread) => structuredClone(thread));
  }

  getTicket(id: string): Ticket | undefined {
    const value = this.tickets.get(id);
    return value ? structuredClone(value) : undefined;
  }

  saveTicket(ticket: Ticket): void {
    this.tickets.set(ticket.id, structuredClone(ticket));
  }

  listTickets(): Ticket[] {
    return [...this.tickets.values()].map((ticket) => structuredClone(ticket));
  }

  saveDecision(decision: Decision): void {
    this.decisions.set(decision.id, structuredClone(decision));
  }

  getDecision(id: string): Decision | undefined {
    const value = this.decisions.get(id);
    return value ? structuredClone(value) : undefined;
  }

  listDecisions(threadKey: string): Decision[] {
    return [...this.decisions.values()]
      .filter((decision) => decision.thread === threadKey)
      .map((decision) => structuredClone(decision));
  }

  getEval(threadKey: string): Eval | undefined {
    const value = this.evals.get(threadKey);
    return value ? structuredClone(value) : undefined;
  }

  saveEval(evalRecord: Eval): void {
    this.evals.set(evalRecord.thread, structuredClone(evalRecord));
  }

  deleteEval(threadKey: string): void {
    this.evals.delete(threadKey);
  }

  listEvals(): Eval[] {
    return [...this.evals.values()].map((evalRecord) => structuredClone(evalRecord));
  }

  enqueueEffect(kind: EffectKind, key: string, payload: unknown, now: number): EffectRecord {
    const record: EffectRecord = {
      id: `effect_${(this.effectSeq += 1)}`,
      kind,
      key,
      payload,
      attempts: 0,
      nextAt: now,
      createdAt: now,
    };
    this.effects.set(record.id, record);
    return structuredClone(record);
  }

  listEffects(kind?: EffectKind): EffectRecord[] {
    return [...this.effects.values()]
      .filter((effect) => kind === undefined || effect.kind === kind)
      .map((effect) => structuredClone(effect));
  }

  settleEffect(id: string): void {
    this.effects.delete(id);
  }

  failEffect(id: string, attempts: number, nextAt: number): void {
    const record = this.effects.get(id);
    if (!record) return;
    record.attempts = attempts;
    record.nextAt = nextAt;
  }

  getKv(key: string): unknown {
    return this.kv.get(key);
  }

  setKv(key: string, value: unknown): void {
    this.kv.set(key, value);
  }

  health(): HealthEntry[] {
    return [...this.healthEntries.values()].map((entry) => ({ ...entry }));
  }

  setHealth(entry: HealthEntry): void {
    this.healthEntries.set(entry.part, { ...entry });
  }
}
