import {
  SESSION_ENTRY_SUPERAGENT_ROUTER,
  SessionEventType,
  type SessionAgentMode,
  type SessionEntryInfo,
  type SessionId,
  type TraceContext,
} from "@zcode/contracts";
import type { AgentRuntimeInternal } from "./internal.js";

/**
 * 会话模式事实。
 *
 * 模式在 turn 状态机之外，不影响模型请求；用 WeakMap 挂在 runtime 上即可，
 * 不扩 RuntimeConfig，避免每个构造点都要补字段。持久事实由 session_entry 承载，
 * 冷恢复时由 bootstrap 读取后 seed 回 runtime。
 */
const agentModeByRuntime = new WeakMap<AgentRuntimeInternal, SessionAgentMode>();

export function readRuntimeAgentMode(runtime: AgentRuntimeInternal): SessionAgentMode {
  return agentModeByRuntime.get(runtime) ?? "agent";
}

export function seedRuntimeAgentMode(
  runtime: AgentRuntimeInternal,
  agentMode: SessionAgentMode,
): void {
  agentModeByRuntime.set(runtime, agentMode);
}

export function buildSuperAgentRouterEntry(
  sessionId: SessionId,
  agentMode: SessionAgentMode,
): SessionEntryInfo {
  const timestamp = Date.now();
  return {
    id: `${sessionId}:runtime-superagent-router`,
    sessionID: sessionId,
    type: SESSION_ENTRY_SUPERAGENT_ROUTER,
    touchSession: false,
    time: { created: timestamp, updated: timestamp },
    data: { enabled: agentMode === "superagent", agentMode, updatedAt: timestamp },
  };
}

export async function persistRuntimeAgentMode(
  runtime: AgentRuntimeInternal,
  agentMode: SessionAgentMode,
): Promise<void> {
  if (!runtime.sessionPersisted || !runtime.sessionStore?.saveSessionEntry) return;
  await runtime.sessionStore.saveSessionEntry(
    buildSuperAgentRouterEntry(runtime.sessionId, agentMode),
  );
}

/**
 * 切换会话模式：先落盘再改内存，最后发布事件。
 * 与执行状态不同，模式切换不参与权限判定，因此没有 pending gate。
 */
export async function applyRuntimeAgentMode(
  runtime: AgentRuntimeInternal,
  agentMode: SessionAgentMode,
  cause: { reason: "command" | "create" | "resume" | "system"; traceContext?: TraceContext },
): Promise<SessionAgentMode> {
  const previous = readRuntimeAgentMode(runtime);
  if (previous === agentMode) return previous;
  await persistRuntimeAgentMode(runtime, agentMode);
  agentModeByRuntime.set(runtime, agentMode);
  const trace = cause.traceContext ?? runtime.rootTraceContext;
  await runtime.appendEvent(
    runtime.createEvent(
      SessionEventType.SessionAgentModeChanged,
      { from: previous, to: agentMode, reason: cause.reason },
      trace,
    ),
    trace,
  );
  return agentMode;
}
