import type {
  AcceptMode,
  AdmissionCells,
  AssessmentResult,
  DecisionReason,
  Mandate,
  PolicyState,
  Strength,
  SuperAgentSettings,
  Thread,
  Ticket,
  Trigger,
} from "./types.js";
import { reason } from "./reasons.js";

export const DEFAULT_ADMISSION_CELLS: AdmissionCells = {
  listedUnaddressed: "inferred",
  unlistedAddressed: "ignore",
  unlistedUnaddressed: "ignore",
};

export function defaultPolicyState(): PolicyState {
  return {
    version: "",
    acceptMode: "observe",
    evalTimeoutSeconds: 180,
    paused: false,
    rules: [
      {
        id: "review-request",
        name: "Review request",
        instruction: "Review a pull request or change set and report findings.",
        enabled: true,
      },
      {
        id: "bug-fix",
        name: "Bug fix",
        instruction: "Reproduce and fix a reported defect, then open a pull request.",
        enabled: true,
      },
    ],
    sources: {
      github: { allowed: [], bots: [], admission: {} },
      feishu: { allowed: [], bots: [], admission: {} },
    },
  };
}

export function defaultSuperAgentSettings(executionRoot: string): SuperAgentSettings {
  return {
    policy: defaultPolicyState(),
    executor: {
      maxWorkers: 2,
      executionRoot,
      blockedCommands: [],
      unattendedWorkers: false,
    },
    sources: {
      github: {
        enabled: false,
        repository: "",
        cli: "gh",
        observeIssues: false,
        observePulls: false,
        observeComments: false,
        observeCi: false,
      },
      feishu: {
        enabled: false,
        cli: "lark-cli",
        chats: [],
        directMessages: false,
        otherChats: "none",
      },
    },
  };
}

/** 稳定短哈希：只用于标识策略版本，避免把整段 JSON 放进 Mandate。 */
export function hashPolicy(input: unknown): string {
  const text = JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 规则、accept mode 与各 Source 的 Policy 部分共同决定版本。 */
export function computePolicyVersion(policy: Omit<PolicyState, "version">): string {
  return hashPolicy({
    acceptMode: policy.acceptMode,
    rules: policy.rules,
    sources: policy.sources,
    evalTimeoutSeconds: policy.evalTimeoutSeconds,
  });
}

export interface GateContext {
  trigger: Trigger;
  thread: Thread;
  /** 该 Thread 上已有的 Ticket（含已结束），用于区分跟进与首次候选。 */
  tickets: Ticket[];
  policy: PolicyState;
  /** 来源是否接收该行全部消息；决定「未指向 agent」单元格是否可用。 */
  observed: boolean;
}

export interface GateResult {
  strength: Strength;
  basis?: Mandate["basis"];
  cells?: AdmissionCells;
  reason?: DecisionReason;
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function isAllowed(policy: PolicyState, source: string, actor: string): boolean {
  const list = policy.sources[source]?.allowed ?? [];
  return list.some((entry) => normalizeId(entry.id) === normalizeId(actor));
}

function isListedBot(policy: PolicyState, source: string, actor: string): boolean {
  const list = policy.sources[source]?.bots ?? [];
  return list.some((entry) => normalizeId(entry.id) === normalizeId(actor));
}

function admissionCells(
  policy: PolicyState,
  source: string,
  conversation: string,
): AdmissionCells {
  return policy.sources[source]?.admission?.[conversation] ?? DEFAULT_ADMISSION_CELLS;
}

/**
 * Gate：确定性第一层，只判断谁可以发起工作与强度。
 * 模型只参与 Assessment，不能扩大 Gate 给出的强度。
 */
export function gate(context: GateContext): GateResult {
  const { trigger, thread, tickets, policy, observed } = context;
  const conversation = trigger.channel.conversation;

  if (!trigger.human) {
    if (isListedBot(policy, trigger.source, trigger.actor) && (trigger.addressed || observed)) {
      return { strength: "inferred", basis: "bot" };
    }
    return { strength: "not_admitted", reason: reason("notAdmitted") };
  }

  const allowed = isAllowed(policy, trigger.source, trigger.actor);
  const cells = admissionCells(policy, trigger.source, conversation);

  if (allowed && trigger.addressed) {
    return { strength: "explicit", basis: "addressed", cells };
  }

  // 已有 Ticket 的 Thread 上，人的跟进默认是显式强度；显式准入单元格仍优先。
  if (tickets.length > 0) {
    if (!allowed && trigger.addressed && cells.unlistedAddressed === "explicit") {
      return { strength: "explicit", basis: "admission", cells };
    }
    return { strength: "explicit", basis: "followup", cells };
  }

  const cell = !allowed && !trigger.addressed ? cells.unlistedUnaddressed : null;
  if (trigger.addressed) {
    if (allowed) return { strength: "explicit", basis: "addressed", cells };
    if (cells.unlistedAddressed === "explicit") {
      return { strength: "explicit", basis: "admission", cells };
    }
    if (cells.unlistedAddressed === "inferred" && observed) {
      return { strength: "inferred", basis: "admission", cells };
    }
    return { strength: "not_admitted", reason: reason("notAdmitted") };
  }

  // 未指向 agent 的消息只有在来源接收全部消息时才进入准入判断。
  if (!observed) return { strength: "not_admitted", reason: reason("notAdmitted") };
  if (allowed && cells.listedUnaddressed === "inferred") {
    return { strength: "inferred", basis: "admission", cells };
  }
  if (cell === "inferred") return { strength: "inferred", basis: "admission", cells };
  if (cell === "ignore") return { strength: "not_admitted", reason: reason("notAdmitted") };
  return { strength: "not_admitted", reason: reason("notAdmitted") };
}

export function isRuleEnabled(policy: PolicyState, ruleId: string): boolean {
  return policy.rules.some((rule) => rule.id === ruleId && rule.enabled);
}

export function enabledRuleIds(policy: PolicyState): string[] {
  return policy.rules.filter((rule) => rule.enabled).map((rule) => rule.id);
}

/** 主动接纳只允许在 auto 模式且至少匹配一条已启用规则时发生。 */
export function admitsInferred(policy: PolicyState, matchedRuleIds: string[]): boolean {
  return (
    policy.acceptMode === "auto" &&
    matchedRuleIds.some((ruleId) => isRuleEnabled(policy, ruleId))
  );
}

/**
 * Assessment 结果收口：observe 模式把正面的推断接单改记为「would accept」，
 * accept mode 不能改写 Gate 给出的强度。
 */
export function assessmentOutcome(
  policy: PolicyState,
  strongest: Strength,
  assessment: { outcome: "accept" | "stop" | "ignore"; matchedRuleIds: string[]; reasons: DecisionReason[] },
): AssessmentResult {
  if (assessment.outcome === "accept" && strongest === "inferred") {
    // 主动接纳必须同时满足 auto 模式与「匹配到已启用规则」。
    if (!admitsInferred(policy, assessment.matchedRuleIds)) {
      const observing = policy.acceptMode === "observe";
      return {
        outcome: "ignore",
        matchedRuleIds: assessment.matchedRuleIds,
        reasons: [
          ...assessment.reasons,
          reason(observing ? "wouldAccept" : "noMatchingRule"),
        ],
        ...(observing ? { wouldAccept: true } : {}),
      };
    }
  }
  return {
    outcome: assessment.outcome,
    matchedRuleIds: assessment.matchedRuleIds,
    reasons: assessment.reasons,
  };
}

export interface RevalidateContext {
  allowlisted: boolean;
  botListed: boolean;
  /** 恢复要求 Source 仍监听该 Thread，不要求仍接收全部消息。 */
  threadListened: boolean;
}

/** 已结束 Ticket 恢复前按当前 Policy 重新验证 Mandate。 */
export function revalidateMandate(
  mandate: Mandate,
  policy: PolicyState,
  context: RevalidateContext,
): boolean {
  if (!context.threadListened) return false;
  switch (mandate.basis) {
    case "followup":
      return true;
    case "addressed":
      return context.allowlisted;
    case "admission":
      return mandate.strength === "inferred"
        ? policy.acceptMode === "auto" &&
            mandate.ruleIds.some((ruleId) => isRuleEnabled(policy, ruleId))
        : context.allowlisted || policy.acceptMode !== "off";
    case "bot":
      return context.botListed && policy.acceptMode === "auto";
  }
}

export function acceptModeLabel(mode: AcceptMode): string {
  switch (mode) {
    case "off":
      return "off";
    case "observe":
      return "observe";
    case "auto":
      return "auto";
  }
}
