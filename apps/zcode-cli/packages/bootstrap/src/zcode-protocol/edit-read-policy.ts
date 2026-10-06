import { zcodeWorkspaceUpdateEditReadPolicyParamsSchema } from "@zcode/shared";
import { parseParams, type ZCodeProtocolAgentServerContext } from "./server-types.js";

/**
 * 「编辑前必须读取」是 App 全局偏好，每个活跃 session 的 runtime 独立持有运行态。
 * 协议层同时更新进程级缓存供未来 session 继承，并立即下发到已有 session，
 * 避免新旧会话行为分裂；旧 app 实例没有 setter 时按 fail-closed 保持原值。
 */
export async function updateEditReadPolicy(
  context: ZCodeProtocolAgentServerContext,
  rawParams: unknown,
) {
  const params = parseParams(zcodeWorkspaceUpdateEditReadPolicyParamsSchema, rawParams);
  const enabled = params.editRequiresReadEnabled;
  context.appRuntimePreferences.editRequiresReadEnabled = enabled;

  let updatedSessionCount = 0;
  for (const record of context.sessions.values()) {
    if (!record.app.setEditRequiresReadEnabled) continue;
    record.app.setEditRequiresReadEnabled(enabled);
    updatedSessionCount += 1;
  }

  return {
    workspace: params.workspace,
    editRequiresReadEnabled: enabled,
    updatedSessionCount,
  };
}
