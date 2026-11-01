import type { Assessor } from "@zcode/superagent";
import { reason } from "@zcode/superagent";

const RULE_KEYWORDS: Record<string, RegExp> = {
  "review-request": /\breview|look at|check the pr|pull request\b/iu,
  "bug-fix": /\bfix|bug|error|broken|flaky|repro|crash|fail/iu,
};

/**
 * 无模型评估器：按规则关键词与点名关系做判断。
 *
 * 原型用模型完成 Assessment；这里先提供确定性实现，保证显式请求与规则命中都可工作。
 * 接入模型时实现同一个 Assessor 端口即可，Engine 与 Gate 不需要改。
 */
export function createRuleBasedAssessor(): Assessor {
  return {
    async assess({ triggers, rules }) {
      const text = triggers.map((trigger) => trigger.text).join("\n");
      const matched = rules
        .filter((rule) => RULE_KEYWORDS[rule.id]?.test(text))
        .map((rule) => rule.id);
      if (matched.length === 0) {
        return {
          outcome: "ignore",
          matchedRuleIds: [],
          reasonCodes: [{ code: "noMatchingRule" }],
        };
      }
      return {
        outcome: "accept",
        matchedRuleIds: matched,
        reasonCodes: [{ code: "matchedRule", values: matched }],
      };
    },
  };
}

const ASSESSOR_PROMPT = [
  "You are deciding whether a request should become a work item.",
  "Rules are the only allowed proactive work. For every rule, decide whether the request matches.",
  "Answer with JSON only:",
  '{"outcome":"accept|ignore|stop","matchedRuleIds":["..."],"reasonCodes":[{"code":"...","values":["..."]}]}',
].join("\n");

/** 模型评估器：调用方注入一次性文本生成，便于在不同 Host 上复用。 */
export function createModelAssessor(
  complete: (prompt: string) => Promise<string>,
): Assessor {
  return {
    async assess({ triggers, rules, policyVersion }) {
      const prompt = [
        ASSESSOR_PROMPT,
        `Policy version: ${policyVersion}`,
        "Rules:",
        ...rules.map((rule) => `- ${rule.id} (${rule.name}): ${rule.instruction}`),
        "Requests:",
        ...triggers.map((trigger) => `- [${trigger.actor}] ${trigger.text}`),
      ].join("\n");
      const raw = await complete(prompt);
      const parsed = parseAssessment(raw);
      if (!parsed) {
        return {
          outcome: "ignore",
          matchedRuleIds: [],
          reasonCodes: [{ code: "assessmentUnavailable" }],
        };
      }
      return parsed;
    },
  };
}

export function parseAssessment(
  text: string,
): { outcome: "accept" | "ignore" | "stop"; matchedRuleIds: string[]; reasonCodes: { code: string; values?: string[] }[] } | undefined {
  const match = text.match(/\{[\s\S]*\}/u);
  if (!match) return undefined;
  try {
    const value = JSON.parse(match[0]) as {
      outcome?: string;
      matchedRuleIds?: unknown;
      reasonCodes?: unknown;
    };
    if (value.outcome !== "accept" && value.outcome !== "ignore" && value.outcome !== "stop") {
      return undefined;
    }
    return {
      outcome: value.outcome,
      matchedRuleIds: Array.isArray(value.matchedRuleIds)
        ? value.matchedRuleIds.filter((entry): entry is string => typeof entry === "string")
        : [],
      reasonCodes: Array.isArray(value.reasonCodes)
        ? (value.reasonCodes as { code: string; values?: string[] }[])
        : [reason("noMatchingRule")],
    };
  } catch {
    return undefined;
  }
}
