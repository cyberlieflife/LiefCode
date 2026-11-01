import type { Trigger } from "@zcode/superagent";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Source 通过这个端口执行外部 CLI，测试注入假实现即可覆盖轮询与回复。 */
export interface CommandRunner {
  run(
    command: string,
    args: string[],
    options?: { cwd?: string; signal?: AbortSignal },
  ): Promise<CommandResult>;
}

export interface SourceScopeResult {
  listened: boolean;
  /** true = 该行接收全部消息，未指向 agent 的消息也能进入准入判断。 */
  observed: boolean;
  row?: string;
  reason?: string;
}

export interface SourceContextMessage {
  id: string;
  from: string;
  at: number;
  text: string;
  bot?: boolean;
  url?: string;
}

export interface SourceKind<Config = unknown> {
  kind: string;
  title: string;
  description: string;
  /** 读取配置并校验；不合法时抛出，由注册表把 Source 标成 error。 */
  parseConfig(value: unknown): Config;
  /** 决定该 Trigger 是否在本 Source 的接收范围内。 */
  scope(trigger: Trigger, config: Config): SourceScopeResult;
  /** 读取评估与 Worker 需要的线程上下文。 */
  readThreadContext?(
    input: { trigger: Trigger; config: Config; cursor?: string },
    runner: CommandRunner,
    signal: AbortSignal,
  ): Promise<{ messages: SourceContextMessage[]; next?: string }>;
  /** 回复来源。返回 gone 表示目标永久不可达，其余错误由调用方重试。 */
  send(
    input: { trigger: Trigger; config: Config; text: string; key: string },
    runner: CommandRunner,
    signal: AbortSignal,
  ): Promise<"sent" | "gone">;
  /** 拉取增量事件；cursor 由调用方持久化。 */
  poll(
    input: { config: Config; cursor: unknown },
    runner: CommandRunner,
    signal: AbortSignal,
  ): Promise<{ triggers: Trigger[]; cursor: unknown; skipped: number }>;
}
