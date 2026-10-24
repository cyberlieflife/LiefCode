import { useEffect, useState } from "react";
import type { SessionSummary } from "@zcode/shared/zcode-protocol-v4";

import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import {
  acquireSessionsIndex,
  releaseSessionsIndex,
  type SessionsIndexScope,
} from "@/v4/sessionsIndexRegistry.js";
import type { SessionsIndexStoreStatus } from "@/v4/sessionsIndexStore.js";

export interface WorkspacePetSessionsState {
  sessions: readonly SessionSummary[];
  status: SessionsIndexStoreStatus;
}

const EMPTY_STATE: WorkspacePetSessionsState = { sessions: [], status: "idle" };

/**
 * 订阅焦点 workspace 的 sessions-index，供桌宠聚合多任务。
 *
 * 与侧栏共用 sessionsIndexRegistry 的引用计数 store，不建立第二条数据通道；
 * remote workspace 由 useWorkspaceServicesResolution 的 rpcReady 门控，断连时保持空列表。
 */
export function useWorkspacePetSessions(params: {
  workspacePath: string;
  workspaceIdentity?: string | null;
  remoteSessionId?: string | null;
  enabled: boolean;
}): WorkspacePetSessionsState {
  const { workspacePath, workspaceIdentity, remoteSessionId, enabled } = params;
  const resolution = useWorkspaceServicesResolution(
    workspacePath,
    remoteSessionId,
    workspaceIdentity,
  );
  const agentService = resolution.services.zcodeAgentService;
  const rpcReady = resolution.rpcReady;
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const signature = [remoteSessionId ?? "__base__", workspaceIdentity ?? "", workspacePath].join(
    "\0",
  );
  const [state, setState] = useState<WorkspacePetSessionsState>(EMPTY_STATE);

  // workspace 切换的第一帧不能拿上一个 workspace 的会话出卡。
  useEffect(() => {
    setState(EMPTY_STATE);
  }, [signature]);

  useEffect(() => {
    if (!enabled || !rpcReady || !agentService) {
      setState(EMPTY_STATE);
      return;
    }
    const scope: SessionsIndexScope = {
      workspaceKey,
      workspacePath,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
      ...(remoteSessionId ? { endpointKey: remoteSessionId } : {}),
    };
    const store = acquireSessionsIndex(scope, agentService);
    const syncState = () => {
      setState({ sessions: store.getSessions(), status: store.getStatus() });
    };
    const unsubscribe = store.subscribe(syncState);
    syncState();
    return () => {
      unsubscribe();
      releaseSessionsIndex(scope, store);
    };
  }, [
    agentService,
    enabled,
    remoteSessionId,
    rpcReady,
    signature,
    workspaceIdentity,
    workspaceKey,
    workspacePath,
  ]);

  return state;
}
