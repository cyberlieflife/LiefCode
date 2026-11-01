import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/logger.js";
import { readSnapshot, type SuperAgentDispatch, type SuperAgentSnapshotView } from "./types.js";

const POLL_INTERVAL_MS = 5_000;

export function useSuperAgentPanel(input: {
  open: boolean;
  dispatch: SuperAgentDispatch;
  sessionId: string | null;
}) {
  const { open, dispatch, sessionId } = input;
  const [snapshot, setSnapshot] = useState<SuperAgentSnapshotView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  // dispatch 由宿主内联构造，每次渲染都是新函数；放进 ref 才能让 refresh/effect 稳定，
  // 否则轮询 effect 会在每次快照渲染后重建并立即再拉一次，触发 React #185 更新深度超限。
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const ack = await dispatchRef.current("superAgentQuery", {});
    if (!mounted.current) return;
    if (ack?.status !== "accepted" && ack?.status !== "noop" && ack?.status !== "duplicate") {
      setError(ack?.reasonCode ?? ack?.message ?? "superagent_unavailable");
      return;
    }
    setError(null);
    const next = readSnapshot(ack);
    if (next) setSnapshot(next);
  }, [sessionId]);

  useEffect(() => {
    if (!open || !sessionId) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [open, refresh, sessionId]);

  const run = useCallback(
    async (type: string, payload: Record<string, unknown>) => {
      setBusy(true);
      try {
        const ack = await dispatchRef.current(type, payload);
        if (ack?.status !== "accepted" && ack?.status !== "noop" && ack?.status !== "duplicate") {
          setError(ack?.reasonCode ?? ack?.message ?? "superagent_action_failed");
        } else {
          setError(null);
          const next = readSnapshot(ack);
          if (next) setSnapshot(next);
        }
        return ack;
      } catch (err) {
        logger.warn("[superagent] command failed", { error: String(err) });
        setError(String(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { snapshot, error, busy, refresh, run };
}
