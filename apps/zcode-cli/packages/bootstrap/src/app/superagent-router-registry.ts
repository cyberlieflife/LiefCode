/**
 * 一个 workspace 只允许一个 SuperAgent 路由器。
 *
 * 本进程内的认领登记：新会话显式切换时，如果旧路由器没有开放工单，就把它降级后交接，
 * 而不是让用户去别处找一个看不见的会话。跨窗口互斥仍由 runtime_lease 承担。
 */
const routersByProject = new Map<string, string>();
const downgrades = new Map<string, { sessionId: string; downgrade: () => Promise<boolean> }>();

export type SuperAgentRouterClaim =
  | { ok: true }
  | { ok: false; sessionId: string };

export function claimSuperAgentRouter(
  projectID: string,
  sessionId: string,
): SuperAgentRouterClaim {
  const existing = routersByProject.get(projectID);
  if (existing && existing !== sessionId) {
    return { ok: false, sessionId: existing };
  }
  routersByProject.set(projectID, sessionId);
  return { ok: true };
}

/** 旧路由器提供一个「无开放工单则可安全降级」的回调；返回 false 表示不能交接。 */
export function registerSuperAgentRouterDowngrade(
  projectID: string,
  sessionId: string,
  downgrade: () => Promise<boolean>,
): void {
  downgrades.set(projectID, { sessionId, downgrade });
}

/** 交接：先让旧路由器降级并释放，再允许新会话认领。 */
export async function transferSuperAgentRouter(
  projectID: string,
  toSessionId: string,
): Promise<boolean> {
  const current = routersByProject.get(projectID);
  if (!current || current === toSessionId) return true;
  const entry = downgrades.get(projectID);
  if (!entry || entry.sessionId !== current) return false;
  const ok = await entry.downgrade();
  if (!ok) return false;
  downgrades.delete(projectID);
  releaseSuperAgentRouter(projectID, current);
  return true;
}

export function releaseSuperAgentRouter(projectID: string, sessionId: string): void {
  if (routersByProject.get(projectID) === sessionId) {
    routersByProject.delete(projectID);
  }
  if (downgrades.get(projectID)?.sessionId === sessionId) {
    downgrades.delete(projectID);
  }
}

export function getSuperAgentRouterSessionId(projectID: string): string | undefined {
  return routersByProject.get(projectID);
}
