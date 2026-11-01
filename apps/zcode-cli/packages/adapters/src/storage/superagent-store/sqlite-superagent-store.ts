import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Decision,
  Eval,
  HealthEntry,
  SuperAgentSettings,
  Thread,
  Ticket,
  Trigger,
} from "@zcode/superagent";
import type { EffectKind, EffectRecord, SuperAgentStore } from "@zcode/superagent";
import { SUPERAGENT_SCHEMA_SQL } from "./schema.js";

const SCHEMA_VERSION = 1;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export interface SqliteSuperAgentStoreOptions {
  dbPath: string;
}

/**
 * SuperAgent 的单一写者存储。
 * 所有写方法同步执行，调用方（Engine）保证每次变更只走一条命令。
 */
export class SqliteSuperAgentStore implements SuperAgentStore, Disposable {
  private readonly db: DatabaseSync;

  constructor(options: SqliteSuperAgentStoreOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.db = new DatabaseSync(options.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SUPERAGENT_SCHEMA_SQL);
    const version = Number(
      (this.db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined)
        ?.user_version ?? 0,
    );
    if (version < SCHEMA_VERSION) this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  static defaultPath(userHome: string): string {
    return join(userHome, ".zcode", "v2", "superagent.sqlite");
  }

  close(): void {
    this.db.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  loadSettings(): SuperAgentSettings | undefined {
    const row = this.db.prepare("SELECT json FROM sa_settings WHERE id = 1").get() as
      | { json?: string }
      | undefined;
    return row?.json ? (parseJson<SuperAgentSettings>(row.json, undefined as never) ?? undefined) : undefined;
  }

  saveSettings(settings: SuperAgentSettings): void {
    const now = Date.now();
    const current = this.db.prepare("SELECT revision FROM sa_settings WHERE id = 1").get() as
      | { revision?: number }
      | undefined;
    const revision = Number(current?.revision ?? 0) + 1;
    this.db
      .prepare(
        "INSERT INTO sa_settings (id, json, revision, updated_at) VALUES (1, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET json = excluded.json, revision = excluded.revision, updated_at = excluded.updated_at",
      )
      .run(stringify(settings), revision, now);
    this.db
      .prepare("INSERT INTO sa_settings_history (revision, json, created_at) VALUES (?, ?, ?)")
      .run(revision, stringify(settings), now);
  }

  settingsRevision(): number {
    const row = this.db.prepare("SELECT revision FROM sa_settings WHERE id = 1").get() as
      | { revision?: number }
      | undefined;
    return Number(row?.revision ?? 0);
  }

  getTrigger(id: string): Trigger | undefined {
    const row = this.db.prepare("SELECT * FROM sa_trigger WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.toTrigger(row) : undefined;
  }

  saveTrigger(trigger: Trigger): void {
    this.db
      .prepare(
        "INSERT INTO sa_trigger (id, source, threads_json, actor, human, addressed, text, at, channel_json, meta_json) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET source=excluded.source, threads_json=excluded.threads_json, actor=excluded.actor, human=excluded.human, addressed=excluded.addressed, text=excluded.text, at=excluded.at, channel_json=excluded.channel_json, meta_json=excluded.meta_json",
      )
      .run(
        trigger.id,
        trigger.source,
        stringify(trigger.threads),
        trigger.actor,
        trigger.human ? 1 : 0,
        trigger.addressed ?? null,
        trigger.text,
        trigger.at,
        stringify(trigger.channel),
        trigger.meta ? stringify(trigger.meta) : null,
      );
  }

  listThreadTriggers(threadKey: string): Trigger[] {
    const rows = this.db
      .prepare("SELECT * FROM sa_trigger WHERE threads_json LIKE ? ORDER BY at ASC")
      .all(`%${JSON.stringify(threadKey)}%`) as Record<string, unknown>[];
    return rows.map((row) => this.toTrigger(row));
  }

  getThread(key: string): Thread | undefined {
    const row = this.db.prepare("SELECT * FROM sa_thread WHERE key = ?").get(key) as
      | Record<string, unknown>
      | undefined;
    return row ? this.toThread(row) : undefined;
  }

  saveThread(thread: Thread): void {
    this.db
      .prepare(
        "INSERT INTO sa_thread (key, source, meta_json, context_json, subscriptions_json, expired_evals, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET source=excluded.source, meta_json=excluded.meta_json, context_json=excluded.context_json, subscriptions_json=excluded.subscriptions_json, expired_evals=excluded.expired_evals",
      )
      .run(
        thread.key,
        thread.source,
        thread.meta ? stringify(thread.meta) : null,
        stringify(thread.contextTicketIds),
        stringify(thread.subscriptions),
        thread.expiredEvals,
        thread.createdAt,
      );
  }

  listThreads(): Thread[] {
    return (this.db.prepare("SELECT * FROM sa_thread").all() as Record<string, unknown>[]).map((row) =>
      this.toThread(row),
    );
  }

  getTicket(id: string): Ticket | undefined {
    const row = this.db.prepare("SELECT * FROM sa_ticket WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.toTicket(row) : undefined;
  }

  saveTicket(ticket: Ticket): void {
    this.db
      .prepare(
        "INSERT INTO sa_ticket (id, short_name, title, open, origin_json, mandate_json, execution_json, assignment_json, delivery_json, follows_json, latest_report_json, inputs_json, last_human_input_at, created_at, ended_at, outcome) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET short_name=excluded.short_name, title=excluded.title, open=excluded.open, origin_json=excluded.origin_json, mandate_json=excluded.mandate_json, execution_json=excluded.execution_json, assignment_json=excluded.assignment_json, delivery_json=excluded.delivery_json, follows_json=excluded.follows_json, latest_report_json=excluded.latest_report_json, inputs_json=excluded.inputs_json, last_human_input_at=excluded.last_human_input_at, ended_at=excluded.ended_at, outcome=excluded.outcome",
      )
      .run(
        ticket.id,
        ticket.shortName,
        ticket.title,
        ticket.open ? 1 : 0,
        stringify(ticket.origin),
        stringify(ticket.mandate),
        stringify(ticket.execution),
        ticket.assignment ? stringify(ticket.assignment) : null,
        ticket.delivery ? stringify(ticket.delivery) : null,
        stringify(ticket.follows),
        ticket.latestReport ? stringify(ticket.latestReport) : null,
        stringify(ticket.inputs),
        ticket.lastHumanInputAt ?? null,
        ticket.createdAt,
        ticket.endedAt ?? null,
        ticket.outcome ?? null,
      );
  }

  listTickets(): Ticket[] {
    return (this.db.prepare("SELECT * FROM sa_ticket").all() as Record<string, unknown>[]).map((row) =>
      this.toTicket(row),
    );
  }

  saveDecision(decision: Decision): void {
    this.db
      .prepare(
        "INSERT INTO sa_decision (id, thread, trigger_ids_json, outcome, reasons_json, rule_ids_json, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET outcome=excluded.outcome, reasons_json=excluded.reasons_json, rule_ids_json=excluded.rule_ids_json",
      )
      .run(
        decision.id,
        decision.thread,
        stringify(decision.triggerIds),
        decision.outcome,
        stringify(decision.reasons),
        stringify(decision.ruleIds),
        decision.at,
      );
  }

  getDecision(id: string): Decision | undefined {
    const row = this.db.prepare("SELECT * FROM sa_decision WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.toDecision(row) : undefined;
  }

  listDecisions(threadKey: string): Decision[] {
    const rows = this.db
      .prepare("SELECT * FROM sa_decision WHERE thread = ? ORDER BY at DESC")
      .all(threadKey) as Record<string, unknown>[];
    return rows.map((row) => this.toDecision(row));
  }

  getEval(threadKey: string): Eval | undefined {
    const row = this.db.prepare("SELECT * FROM sa_eval WHERE thread = ?").get(threadKey) as
      | Record<string, unknown>
      | undefined;
    return row ? this.toEval(row) : undefined;
  }

  saveEval(evalRecord: Eval): void {
    this.db
      .prepare(
        "INSERT INTO sa_eval (thread, trigger_ids_json, started_at, deadline_at, delivered_at, attempts, dismissed) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(thread) DO UPDATE SET trigger_ids_json=excluded.trigger_ids_json, started_at=excluded.started_at, deadline_at=excluded.deadline_at, delivered_at=excluded.delivered_at, attempts=excluded.attempts, dismissed=excluded.dismissed",
      )
      .run(
        evalRecord.thread,
        stringify(evalRecord.triggerIds),
        evalRecord.startedAt,
        evalRecord.deadlineAt,
        evalRecord.deliveredAt ?? null,
        evalRecord.attempts,
        evalRecord.dismissed ? 1 : 0,
      );
  }

  deleteEval(threadKey: string): void {
    this.db.prepare("DELETE FROM sa_eval WHERE thread = ?").run(threadKey);
  }

  listEvals(): Eval[] {
    return (this.db.prepare("SELECT * FROM sa_eval").all() as Record<string, unknown>[]).map((row) =>
      this.toEval(row),
    );
  }

  enqueueEffect(kind: EffectKind, key: string, payload: unknown, now: number): EffectRecord {
    const id = `effect_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.db
      .prepare(
        "INSERT INTO sa_effect (id, kind, key, payload_json, attempts, next_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      )
      .run(id, kind, key, stringify(payload), now, now);
    return { id, kind, key, payload, attempts: 0, nextAt: now, createdAt: now };
  }

  listEffects(kind?: EffectKind): EffectRecord[] {
    const rows = (
      kind
        ? this.db.prepare("SELECT * FROM sa_effect WHERE kind = ? ORDER BY created_at ASC").all(kind)
        : this.db.prepare("SELECT * FROM sa_effect ORDER BY created_at ASC").all()
    ) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      kind: String(row.kind) as EffectKind,
      key: String(row.key),
      payload: parseJson(row.payload_json, null),
      attempts: Number(row.attempts),
      nextAt: Number(row.next_at),
      createdAt: Number(row.created_at),
    }));
  }

  settleEffect(id: string): void {
    this.db.prepare("DELETE FROM sa_effect WHERE id = ?").run(id);
  }

  failEffect(id: string, attempts: number, nextAt: number): void {
    this.db
      .prepare("UPDATE sa_effect SET attempts = ?, next_at = ? WHERE id = ?")
      .run(attempts, nextAt, id);
  }

  getKv(key: string): unknown {
    const row = this.db.prepare("SELECT value_json FROM sa_kv WHERE key = ?").get(key) as
      | { value_json?: string }
      | undefined;
    return row?.value_json ? parseJson(row.value_json, undefined as never) : undefined;
  }

  setKv(key: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO sa_kv (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
      )
      .run(key, stringify(value));
  }

  health(): HealthEntry[] {
    return (this.db.prepare("SELECT * FROM sa_health").all() as Record<string, unknown>[]).map(
      (row) => ({
        part: String(row.part),
        state: String(row.state) as HealthEntry["state"],
        detail: typeof row.detail === "string" ? row.detail : undefined,
        at: Number(row.at),
      }),
    );
  }

  setHealth(entry: HealthEntry): void {
    this.db
      .prepare(
        "INSERT INTO sa_health (part, state, detail, at) VALUES (?, ?, ?, ?) ON CONFLICT(part) DO UPDATE SET state = excluded.state, detail = excluded.detail, at = excluded.at",
      )
      .run(entry.part, entry.state, entry.detail ?? null, entry.at);
  }

  private toTrigger(row: Record<string, unknown>): Trigger {
    return {
      id: String(row.id),
      source: String(row.source),
      threads: parseJson(row.threads_json, [] as string[]),
      actor: String(row.actor),
      human: Number(row.human) === 1,
      ...(row.addressed ? { addressed: String(row.addressed) as "mention" | "direct" } : {}),
      text: String(row.text),
      at: Number(row.at),
      channel: parseJson(row.channel_json, { conversation: "", anchor: "" }),
      ...(row.meta_json ? { meta: parseJson(row.meta_json, undefined as never) } : {}),
    };
  }

  private toThread(row: Record<string, unknown>): Thread {
    return {
      key: String(row.key),
      source: String(row.source),
      ...(row.meta_json ? { meta: parseJson(row.meta_json, undefined as never) } : {}),
      contextTicketIds: parseJson(row.context_json, [] as string[]),
      subscriptions: parseJson(row.subscriptions_json, [] as Thread["subscriptions"]),
      expiredEvals: Number(row.expired_evals),
      createdAt: Number(row.created_at),
    };
  }

  private toTicket(row: Record<string, unknown>): Ticket {
    return {
      id: String(row.id),
      shortName: String(row.short_name),
      title: String(row.title),
      open: Number(row.open) === 1,
      origin: parseJson(row.origin_json, {} as Ticket["origin"]),
      mandate: parseJson(row.mandate_json, {} as Ticket["mandate"]),
      execution: parseJson(row.execution_json, { name: "", directory: "" }),
      ...(row.assignment_json
        ? { assignment: parseJson(row.assignment_json, undefined as never) }
        : {}),
      ...(row.delivery_json ? { delivery: parseJson(row.delivery_json, undefined as never) } : {}),
      follows: parseJson(row.follows_json, [] as Ticket["follows"]),
      ...(row.latest_report_json
        ? { latestReport: parseJson(row.latest_report_json, undefined as never) }
        : {}),
      inputs: parseJson(row.inputs_json, [] as Ticket["inputs"]),
      ...(row.last_human_input_at ? { lastHumanInputAt: Number(row.last_human_input_at) } : {}),
      createdAt: Number(row.created_at),
      ...(row.ended_at ? { endedAt: Number(row.ended_at) } : {}),
      ...(row.outcome ? { outcome: String(row.outcome) as Ticket["outcome"] } : {}),
    };
  }

  private toDecision(row: Record<string, unknown>): Decision {
    return {
      id: String(row.id),
      thread: String(row.thread),
      triggerIds: parseJson(row.trigger_ids_json, [] as string[]),
      outcome: String(row.outcome) as Decision["outcome"],
      reasons: parseJson(row.reasons_json, [] as Decision["reasons"]),
      ruleIds: parseJson(row.rule_ids_json, [] as string[]),
      at: Number(row.at),
    };
  }

  private toEval(row: Record<string, unknown>): Eval {
    return {
      thread: String(row.thread),
      triggerIds: parseJson(row.trigger_ids_json, [] as string[]),
      startedAt: Number(row.started_at),
      deadlineAt: Number(row.deadline_at),
      ...(row.delivered_at ? { deliveredAt: Number(row.delivered_at) } : {}),
      attempts: Number(row.attempts),
      ...(Number(row.dismissed) === 1 ? { dismissed: true } : {}),
    };
  }
}
