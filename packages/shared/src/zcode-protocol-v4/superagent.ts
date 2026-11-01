import { z } from "zod";

/**
 * SuperAgent 面板协议。
 * 快照允许键演进（passthrough），但面板依赖的顶层事实必须显式声明，
 * 避免旧 CLI 返回缺字段时 UI 静默渲染成空看板。
 */
export const superAgentHealthSchema = z.object({
  part: z.string(),
  state: z.enum(["starting", "ready", "paused", "error"]),
  detail: z.string().optional(),
  at: z.number(),
});

export const superAgentOverviewSchema = z.object({
  openTickets: z.number().int().nonnegative(),
  waitingForPerson: z.number().int().nonnegative(),
  working: z.number().int().nonnegative(),
  triggers24h: z.number().int().nonnegative(),
  decisions24h: z.number().int().nonnegative(),
});

export const superAgentSnapshotSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    workspaceKey: z.string(),
    paused: z.boolean(),
    policyVersion: z.string(),
    acceptMode: z.string(),
    rules: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        instruction: z.string(),
        enabled: z.boolean().optional(),
      }),
    ),
    sourceSettings: z.record(z.string(), z.unknown()),
    policySettings: z.record(z.string(), z.unknown()),
    executorSettings: z.record(z.string(), z.unknown()),
    health: z.array(superAgentHealthSchema),
    tickets: z.array(z.record(z.string(), z.unknown())),
    threads: z.array(z.record(z.string(), z.unknown())),
    decisions: z.array(z.record(z.string(), z.unknown())),
    prompts: z.record(z.string(), z.unknown()),
    promptHistory: z.array(z.record(z.string(), z.unknown())),
    overview: superAgentOverviewSchema,
  })
  .passthrough();

export type SuperAgentSnapshot = z.infer<typeof superAgentSnapshotSchema>;

export const superAgentActionSchema = z.enum([
  "pause",
  "resume",
  "ticket.retry",
  "ticket.stop",
  "ticket.status",
  "reevaluate",
  "dismiss",
  "unsubscribe",
  "note",
]);

export const superAgentQueryPayloadSchema = z.object({});

export const superAgentActionPayloadSchema = z.object({
  action: superAgentActionSchema,
  ticketId: z.string().optional(),
  triggerId: z.string().optional(),
  decisionId: z.string().optional(),
  threadKey: z.string().optional(),
  text: z.string().max(4000).optional(),
});

export const superAgentSaveSettingsPayloadSchema = z.object({
  block: z.enum(["policy", "executor", "sources"]),
  value: z.unknown(),
  revision: z.number().int().nonnegative(),
});

export const superAgentSavePromptsPayloadSchema = z.object({
  sections: z.object({
    communication: z.string(),
    ticketScope: z.string(),
    delivery: z.string(),
  }),
  overrides: z.array(
    z.object({
      part: z.string().min(1),
      text: z.string(),
      baseText: z.string().optional(),
    }),
  ),
  baseRevision: z.number().int().nonnegative(),
});
