import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createSessionId, type SessionId } from "@zcode/contracts";
import type { Ticket } from "@zcode/superagent";
import type { SuperAgentWorkerHost, WorkerSessionHandle } from "./worker-executor.js";

/** Worker 会话只需要这两个能力；具体 AgentRuntime 由 bootstrap 注入。 */
export interface WorkerRuntimeLike {
  executeTurn(input: string, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
  beginShutdown(): void;
}

export interface SuperAgentWorkerHostOptions {
  createRuntime: (input: {
    childSessionId: SessionId;
    workingDirectory: string;
    label: string;
    permissionMode: string;
  }) => WorkerRuntimeLike;
  maxWorkers: () => number;
  prepareCommand?: () => string | undefined;
  permissionMode?: () => string;
  prepareShell?: string;
  prepareTimeoutMs?: number;
  logger?: { warn(event: string, data?: unknown): void };
}

function prepareEnv(ticket: Ticket): Record<string, string> {
  return {
    LIEF_SUPERAGENT_TICKET: ticket.id,
    LIEF_SUPERAGENT_NAME: ticket.shortName,
    LIEF_SUPERAGENT_DIR: ticket.execution.directory,
  };
}

/** Worker host：负责目录、prepare 命令与 worker 会话的创建/运行。 */
export function createSuperAgentWorkerHost(
  options: SuperAgentWorkerHostOptions,
): SuperAgentWorkerHost {
  return {
    maxWorkers: () => options.maxWorkers(),
    async prepare(ticket) {
      await mkdir(ticket.execution.directory, { recursive: true });
      const command = options.prepareCommand?.();
      if (!command) return;
      await runPrepare(command, ticket, options);
    },
    async createSession(ticket): Promise<WorkerSessionHandle> {
      const childSessionId = createSessionId(`superagent_worker_${ticket.id}`);
      const runtime = options.createRuntime({
        childSessionId,
        workingDirectory: ticket.execution.directory,
        label: `superagent worker ${ticket.shortName}`,
        permissionMode: options.permissionMode?.() ?? "yolo",
      });
      return {
        sessionId: childSessionId,
        async run(workerTicket, input) {
          await runtime.executeTurn(input.text);
          void workerTicket;
        },
        async stop() {
          runtime.beginShutdown();
        },
      };
    },
  };
}

function runPrepare(
  command: string,
  ticket: Ticket,
  options: SuperAgentWorkerHostOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      options.prepareShell ?? "sh",
      ["-c", command],
      {
        cwd: ticket.execution.directory,
        env: { ...process.env, ...prepareEnv(ticket) },
        timeout: options.prepareTimeoutMs ?? 10 * 60 * 1000,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }
        options.logger?.warn("superagent.prepare.failed", {
          ticketId: ticket.id,
          stdout: stdout.slice(-4000),
          stderr: stderr.slice(-4000),
          error: String(error),
        });
        reject(new Error(`prepare failed: ${stderr.trim() || error.message}`));
      },
    );
  });
}
