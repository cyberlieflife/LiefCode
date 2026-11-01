import type { DecisionReason } from "./types.js";

/** 核心 Decision 原因码；面板按 reason.<code> 取文案。 */
export const REASONS = {
  timeout: "评估超时",
  policyChanged: "策略已变更",
  routed: "已路由到工单",
  startedTicket: "已创建工单",
  ignoredFromCard: "卡片与已启用规则无关",
  wouldAccept: "观察模式：记录但未接单",
  stoppedByPerson: "被人停止",
  modeSwitched: "会话模式切换",
  noMatchingRule: "未匹配任何已启用规则",
  notAdmitted: "来源未准入",
  duplicate: "重复事件",
  threadClosed: "来源线程已关闭",
} as const;

export type ReasonCode = keyof typeof REASONS;

export function reason(code: ReasonCode, values?: string[], triggerId?: string): DecisionReason {
  return {
    code,
    ...(values && values.length > 0 ? { values } : {}),
    ...(triggerId ? { triggerId } : {}),
  };
}

export function reasonText(entry: DecisionReason): string {
  const base = (REASONS as Record<string, string>)[entry.code] ?? entry.code;
  return entry.values && entry.values.length > 0 ? `${base}: ${entry.values.join(", ")}` : base;
}
