import type {
  Decision,
  Eval,
  HealthEntry,
  SuperAgentSettings,
  Thread,
  Ticket,
  Trigger,
} from "./types.js";

export interface Clock {
  now(): number;
}

/** 非失败的重试信号：并发槽已满、暂停中等，不记为错误也不触发健康告警。 */
export class LaterError extends Error {
  constructor(message = "retry later") {
    super(message);
    this.name = "LaterError";
  }
}

export const systemClock: Clock = { now: () => Date.now() };

export type EffectKind =
  | "assessment"
  | "launch"
  | "delivery"
  | "relay"
  | "notice"
  | "reply"
  | "policySync";

export interface EffectRecord {
  id: string;
  kind: EffectKind;
  key: string;
  payload: unknown;
  attempts: number;
  nextAt: number;
  createdAt: number;
}

export interface SuperAgentStore {
  loadSettings(): SuperAgentSettings | undefined;
  saveSettings(settings: SuperAgentSettings): void;

  getTrigger(id: string): Trigger | undefined;
  saveTrigger(trigger: Trigger): void;
  listThreadTriggers(threadKey: string): Trigger[];

  getThread(key: string): Thread | undefined;
  saveThread(thread: Thread): void;
  listThreads(): Thread[];

  getTicket(id: string): Ticket | undefined;
  saveTicket(ticket: Ticket): void;
  listTickets(): Ticket[];

  saveDecision(decision: Decision): void;
  listDecisions(threadKey: string): Decision[];
  getDecision(id: string): Decision | undefined;

  getEval(threadKey: string): Eval | undefined;
  saveEval(evalRecord: Eval): void;
  deleteEval(threadKey: string): void;
  listEvals(): Eval[];

  enqueueEffect(kind: EffectKind, key: string, payload: unknown, now: number): EffectRecord;
  listEffects(kind?: EffectKind): EffectRecord[];
  settleEffect(id: string): void;
  failEffect(id: string, attempts: number, nextAt: number): void;

  getKv(key: string): unknown;
  setKv(key: string, value: unknown): void;

  health(): HealthEntry[];
  setHealth(entry: HealthEntry): void;
}

export interface Assessor {
  assess(input: {
    thread: Thread;
    triggers: Trigger[];
    tickets: Ticket[];
    rules: { id: string; name: string; instruction: string }[];
    policyVersion: string;
  }): Promise<{
    outcome: "accept" | "stop" | "ignore";
    matchedRuleIds: string[];
    reasonCodes: { code: string; values?: string[] }[];
    said?: string;
  }>;
}

export interface ExecutorPort {
  /** 返回该 Ticket 新建的 worker 会话；失败抛出表示 Ticket 失败。 */
  launch(ticket: Ticket): Promise<{ sessionId: string }>;
  deliver(ticket: Ticket, inputIds: string[]): Promise<void>;
  stop(ticket: Ticket): Promise<void>;
}

export interface SourcePort {
  send(input: {
    source: string;
    channel: { conversation: string; anchor: string };
    text: string;
    key: string;
  }): Promise<"sent" | "gone">;
}
