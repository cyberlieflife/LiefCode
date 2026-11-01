/** 面板视图模型：只描述 UI 读取的字段，权威结构在 CLI 侧。 */
export interface SuperAgentHealthView {
  part: string;
  state: "starting" | "ready" | "paused" | "error";
  detail?: string;
  at: number;
}

export interface SuperAgentTicketView {
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
}

export interface SuperAgentThreadView {
  key: string;
  source: string;
  subscriptions: number;
  contextTickets: number;
  triggers: number;
}

export interface SuperAgentDecisionView {
  id: string;
  thread: string;
  triggerIds: string[];
  outcome: string;
  reasons: { code: string; values?: string[] }[];
  at: number;
}

export interface SuperAgentPromptView {
  revision: number;
  sections: { communication: string; ticketScope: string; delivery: string };
  overrides: { part: string; text: string; baseText?: string }[];
  savedAt: number;
}

export interface SuperAgentSnapshotView {
  revision: number;
  workspaceKey: string;
  paused: boolean;
  policyVersion: string;
  acceptMode: string;
  rules: { id: string; name: string; instruction: string; enabled?: boolean }[];
  policySettings: Record<string, unknown>;
  sourceSettings: Record<string, unknown>;
  executorSettings: Record<string, unknown>;
  health: SuperAgentHealthView[];
  tickets: SuperAgentTicketView[];
  threads: SuperAgentThreadView[];
  decisions: SuperAgentDecisionView[];
  prompts: SuperAgentPromptView;
  promptHistory: SuperAgentPromptView[];
  overview: {
    openTickets: number;
    waitingForPerson: number;
    working: number;
    triggers24h: number;
    decisions24h: number;
  };
}

export interface SuperAgentAck {
  status: string;
  reasonCode?: string;
  message?: string;
  result?: { type?: string; snapshot?: unknown };
}

export type SuperAgentDispatch = (
  type: string,
  payload: Record<string, unknown>,
) => Promise<SuperAgentAck | null>;

export function readSnapshot(ack: SuperAgentAck | null): SuperAgentSnapshotView | null {
  const snapshot = ack?.result?.type === "superAgent" ? ack.result.snapshot : undefined;
  return snapshot && typeof snapshot === "object" ? (snapshot as SuperAgentSnapshotView) : null;
}

/**
 * 失败回执的可读原因：`fault.command.executionFailed` 是协议层归一码，
 * 真正原因在 message（例如来源配置校验失败）；其余领域错误码更具体，保持原样。
 */
export function describeSuperAgentAckError(ack: SuperAgentAck | null, fallback: string): string {
  if (ack?.reasonCode === "fault.command.executionFailed" && ack.message) return ack.message;
  return ack?.reasonCode ?? ack?.message ?? fallback;
}
