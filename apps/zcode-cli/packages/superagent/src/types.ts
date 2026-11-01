/** SuperAgent 领域模型：Trigger → Thread → Eval → Ticket → Assignment → Report。 */

export type Strength = "explicit" | "inferred" | "not_admitted";

export type DecisionOutcome = "accept" | "stop" | "ignore" | "unavailable";

export type AcceptMode = "off" | "observe" | "auto";

export type AssignmentStatus = "pending" | "running" | "ended";

export type ReportKind = "progress" | "waiting" | "ready" | "blocked" | "failed" | "dropped";

export type TicketStage =
  | "person/delivery"
  | "person/review"
  | "person/answer"
  | "person/blocked-failed"
  | "working/queued"
  | "idle"
  | "working";

export type InputKind = "trigger" | "text" | "policy";

export interface ChannelAddress {
  /** 来源内部的会话/仓库标识，用于回复路由。 */
  conversation: string;
  /** 回复挂载点（消息 id / issue 号 / PR 号）。 */
  anchor: string;
  /** 面板可点击的原始链接。 */
  url?: string;
}

export interface Trigger {
  id: string;
  source: string;
  threads: string[];
  actor: string;
  /** false = bot / CI；这类消息只能产生推断候选。 */
  human: boolean;
  /** mention = 明确点名；direct = 私信；缺席 = 未指向 agent。 */
  addressed?: "mention" | "direct";
  text: string;
  at: number;
  channel: ChannelAddress;
  meta?: Record<string, unknown>;
}

export interface ThreadSubscription {
  ticketId: string;
  /** true = 该 Thread 由这张 Ticket 开启，用于结束判定与恢复边界。 */
  own: boolean;
}

export interface Thread {
  key: string;
  source: string;
  meta?: Record<string, unknown>;
  /** 仅上下文订阅：只送消息，不给跟进强度、不恢复已结束 Ticket。 */
  contextTicketIds: string[];
  subscriptions: ThreadSubscription[];
  /** 连续超时的 Eval 次数；第三次记 unavailable。 */
  expiredEvals: number;
  createdAt: number;
}

export interface Rule {
  id: string;
  name: string;
  instruction: string;
}

export interface TicketFollow {
  thread: string;
  own: boolean;
  closedAt?: number;
  outcome?: "merged" | "closed";
}

export interface Mandate {
  policyVersion: string;
  strength: Strength;
  ruleIds: string[];
  scope: string[];
  sender: string;
  basis: "addressed" | "followup" | "admission" | "bot";
}

export interface TicketInput {
  id: string;
  kind: InputKind;
  at: number;
  text?: string;
  triggerId?: string;
  /** 人写的输入才可能让 Ticket 离开 blocked/failed。 */
  human: boolean;
  deliveredAt?: number;
  readAt?: number;
}

export interface TicketReport {
  kind: ReportKind;
  text?: string;
  question?: string;
  at: number;
}

export interface TicketAssignment {
  sessionId: string;
  status: AssignmentStatus;
  startedAt: number;
  endedAt?: number;
  /** 重启恢复说明：新 Assignment 必须携带，避免重复外部动作。 */
  recoveryNote?: string;
}

export interface TicketDeliveryFailure {
  error: string;
  at: number;
}

export interface TicketOrigin {
  triggerId: string;
  triggerIds: string[];
  strength: Strength;
  ruleIds: string[];
  basis: Mandate["basis"];
}

export interface Ticket {
  id: string;
  shortName: string;
  title: string;
  open: boolean;
  origin: TicketOrigin;
  mandate: Mandate;
  execution: { name: string; directory: string };
  assignment?: TicketAssignment;
  delivery?: TicketDeliveryFailure;
  follows: TicketFollow[];
  latestReport?: TicketReport;
  inputs: TicketInput[];
  /** 最后一次人写输入的到达时间，用于判断 blocked/failed 是否已被人的消息解除。 */
  lastHumanInputAt?: number;
  createdAt: number;
  endedAt?: number;
  outcome?: "completed" | "stopped" | "merged" | "closed" | "dropped" | "mode_switched";
}

export interface DecisionReason {
  code: string;
  values?: string[];
  triggerId?: string;
  said?: string;
}

export interface Decision {
  id: string;
  thread: string;
  triggerIds: string[];
  outcome: DecisionOutcome;
  reasons: DecisionReason[];
  ruleIds: string[];
  at: number;
}

export interface Eval {
  thread: string;
  triggerIds: string[];
  startedAt: number;
  deadlineAt: number;
  /** 候选送达主会话的时间；未送达不开始计时。 */
  deliveredAt?: number;
  attempts: number;
  dismissed?: boolean;
}

export interface AssessmentResult {
  outcome: "accept" | "stop" | "ignore";
  matchedRuleIds: string[];
  reasons: DecisionReason[];
  /** observe 模式下的「would accept」记录，不创建 Ticket。 */
  wouldAccept?: boolean;
}

export interface PolicyRuleState {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
}

export interface AdmissionCells {
  listedUnaddressed: "inferred" | "ignore";
  unlistedAddressed: "explicit" | "inferred" | "ignore";
  unlistedUnaddressed: "inferred" | "ignore";
}

export interface SourcePolicy {
  allowed: { id: string; name?: string }[];
  bots: { id: string; name?: string }[];
  syncChat?: string;
  admission: Record<string, AdmissionCells>;
}

export interface PolicyState {
  version: string;
  acceptMode: AcceptMode;
  evalTimeoutSeconds: number;
  paused: boolean;
  rules: PolicyRuleState[];
  sources: Record<string, SourcePolicy>;
}

export interface ExecutorSettings {
  maxWorkers: number;
  executionRoot: string;
  prepareCommand?: string;
  blockedCommands: string[];
  /** 无人值守 Worker 的显式开关；默认 false，未开启时不派工。 */
  unattendedWorkers: boolean;
  modelSelection?: { providerId: string; modelId: string; options?: { reasoningLevel?: string } };
}

export interface GithubSourceSettings {
  enabled: boolean;
  repository: string;
  cli: string;
  observeIssues: boolean;
  observePulls: boolean;
  observeComments: boolean;
  observeCi: boolean;
}

export interface FeishuChatSetting {
  chatId: string;
  name: string;
  listen: "mentions" | "all";
}

export interface FeishuSourceSettings {
  enabled: boolean;
  cli: string;
  chats: FeishuChatSetting[];
  directMessages: boolean;
  otherChats: "none" | "mentions";
}

export interface SourceSettings {
  github: GithubSourceSettings;
  feishu: FeishuSourceSettings;
}

export interface PromptSections {
  communication: string;
  ticketScope: string;
  delivery: string;
}

export interface PromptOverride {
  part: string;
  text: string;
  /** 覆盖时的内置原文，升级时用于标注 Default updated。 */
  baseText?: string;
}

export interface PromptConfig {
  revision: number;
  sections: PromptSections;
  overrides: PromptOverride[];
  savedAt: number;
  origin: "panel" | "tool";
}

export interface SuperAgentSettings {
  policy: PolicyState;
  executor: ExecutorSettings;
  sources: SourceSettings;
}

export interface HealthEntry {
  part: string;
  state: "starting" | "ready" | "paused" | "error";
  detail?: string;
  at: number;
}

export interface SuperAgentOverview {
  openTickets: number;
  waitingForPerson: number;
  working: number;
  decisions24h: number;
  triggers24h: number;
}
