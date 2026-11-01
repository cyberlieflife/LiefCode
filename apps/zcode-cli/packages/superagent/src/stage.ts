import type { Ticket, TicketStage } from "./types.js";

/**
 * Ticket 阶段表，按文档顺序从上到下取第一个匹配项。
 * 阶段只描述「谁在等什么」，不是 Executor 的内部状态码。
 */
export function deriveTicketStage(ticket: Ticket, now = Date.now()): TicketStage {
  if (ticket.delivery) return "person/delivery";
  const report = ticket.latestReport;
  if (report?.question) return "person/answer";
  if (report?.kind === "ready") return "person/review";
  if (
    (report?.kind === "blocked" || report?.kind === "failed") &&
    (ticket.lastHumanInputAt ?? 0) <= report.at
  ) {
    return "person/blocked-failed";
  }
  if (!ticket.assignment || ticket.assignment.status === "pending") return "working/queued";
  if (report?.kind === "waiting" || ticket.assignment.status === "ended") return "idle";
  return "working";
}

export function waitsForPerson(ticket: Ticket): boolean {
  const stage = deriveTicketStage(ticket);
  return stage.startsWith("person/");
}

export function isFollowupOwner(ticket: Ticket, threadKey: string): boolean {
  return (
    ticket.open &&
    ticket.follows.some((follow) => follow.thread === threadKey && !follow.closedAt)
  );
}

export function stageLabel(stage: TicketStage): string {
  switch (stage) {
    case "person/delivery":
      return "person/delivery";
    case "person/review":
      return "person/review";
    case "person/answer":
      return "person/answer";
    case "person/blocked-failed":
      return "person/blocked-failed";
    case "working/queued":
      return "working/queued";
    case "idle":
      return "idle";
    case "working":
      return "working";
  }
}
