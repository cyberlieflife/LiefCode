import { LaterError, type ExecutorPort, type Ticket } from "@zcode/superagent";

export interface WorkerSessionHandle {
  sessionId: string;
  /** 把投递的输入作为一轮工作交给 Worker 会话。 */
  run(
    ticket: Ticket,
    input: { text: string; inputIds: string[] },
  ): Promise<void>;
  stop(): Promise<void>;
}

export interface SuperAgentWorkerHost {
  /** 创建执行目录并运行一次 prepare 命令；失败直接抛错，由 Ticket 记录 failed。 */
  prepare(ticket: Ticket): Promise<void>;
  createSession(ticket: Ticket): Promise<WorkerSessionHandle>;
  maxWorkers(): number;
}

/**
 * Worker 执行器：负责并发槽、会话复用与投递。
 * Agent 会话的创建方式由 bootstrap 注入，执行器本身不依赖 AgentRuntime。
 */
export class SuperAgentExecutor implements ExecutorPort {
  private readonly sessions = new Map<string, WorkerSessionHandle>();
  private readonly slots = new Set<string>();

  constructor(private readonly host: SuperAgentWorkerHost) {}

  async launch(ticket: Ticket): Promise<{ sessionId: string }> {
    if (!this.canUseSlot(ticket)) throw new LaterError("worker slots are full");
    this.slots.add(ticket.id);
    try {
      await this.host.prepare(ticket);
      const existing = this.sessions.get(ticket.id);
      if (existing) return { sessionId: existing.sessionId };
      const handle = await this.host.createSession(ticket);
      this.sessions.set(ticket.id, handle);
      return { sessionId: handle.sessionId };
    } catch (error) {
      this.slots.delete(ticket.id);
      throw error;
    }
  }

  private canUseSlot(ticket: Ticket): boolean {
    if (this.slots.has(ticket.id)) return true;
    const limit = Math.max(1, this.host.maxWorkers());
    if (this.slots.size < limit) return true;
    // 额外一个槽留给人对已有工单的继续输入，避免新工单阻塞人。
    return ticket.inputs.some((input) => input.human && input.deliveredAt === undefined);
  }

  async deliver(ticket: Ticket, inputIds: string[]): Promise<void> {
    const handle = this.sessions.get(ticket.id);
    if (!handle) throw new LaterError("worker session is not ready");
    const inputs = ticket.inputs.filter((input) => inputIds.includes(input.id));
    if (inputs.length === 0) return;
    const text = inputs
      .map((input) => (input.kind === "trigger" ? `[来源消息]\n${input.text ?? ""}` : input.text ?? ""))
      .join("\n\n");
    await handle.run(ticket, { text, inputIds });
  }

  async stop(ticket: Ticket): Promise<void> {
    const handle = this.sessions.get(ticket.id);
    this.slots.delete(ticket.id);
    if (!handle) return;
    this.sessions.delete(ticket.id);
    await handle.stop();
  }

  /** 工单结束或被降级时释放所有会话与槽位。 */
  async dispose(): Promise<void> {
    const handles = [...this.sessions.values()];
    this.sessions.clear();
    this.slots.clear();
    await Promise.allSettled(handles.map((handle) => handle.stop()));
  }
}
