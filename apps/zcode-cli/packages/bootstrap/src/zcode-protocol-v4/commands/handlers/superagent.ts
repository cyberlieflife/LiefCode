// SuperAgent 面板命令组：查询、操作、设置与提示词保存。
// 面板与引擎之间只有这一条命令面，避免 UI 直连存储或第二套写路径。
import type {
  CommandEnvelope,
  CommandPayloadMap,
  CommandResult,
} from "@zcode/shared/zcode-protocol-v4";
import { requireRecord } from "../record-access.js";
import type { V4CommandCoreHost } from "../types.js";

function toResult(snapshot: unknown): CommandResult {
  if (!snapshot) throw new Error("superagent_runtime_unavailable");
  return { type: "superAgent", snapshot } as CommandResult;
}

async function superAgentQuery(
  host: V4CommandCoreHost,
  envelope: CommandEnvelope,
): Promise<CommandResult> {
  const record = requireRecord(host, envelope.sessionId);
  return toResult(record.app.getSuperAgentSnapshot());
}

async function superAgentAction(
  host: V4CommandCoreHost,
  envelope: CommandEnvelope,
): Promise<CommandResult> {
  const record = requireRecord(host, envelope.sessionId);
  const payload = envelope.payload as CommandPayloadMap["superAgentAction"];
  return toResult(await record.app.superAgentAction(payload));
}

async function superAgentSaveSettings(
  host: V4CommandCoreHost,
  envelope: CommandEnvelope,
): Promise<CommandResult> {
  const record = requireRecord(host, envelope.sessionId);
  const payload = envelope.payload as CommandPayloadMap["superAgentSaveSettings"];
  return toResult(await record.app.saveSuperAgentSettings(payload));
}

async function superAgentSavePrompts(
  host: V4CommandCoreHost,
  envelope: CommandEnvelope,
): Promise<CommandResult> {
  const record = requireRecord(host, envelope.sessionId);
  const payload = envelope.payload as CommandPayloadMap["superAgentSavePrompts"];
  return toResult(await record.app.saveSuperAgentPrompts(payload));
}

export const superAgentHandlers = {
  superAgentQuery,
  superAgentAction,
  superAgentSaveSettings,
  superAgentSavePrompts,
};
