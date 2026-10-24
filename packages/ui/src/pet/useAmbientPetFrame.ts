import { useEffect, useRef, useState } from "react";
import type { PetAnimation, PetDefinition, PetNotification } from "./contract.js";
import {
  petAnimationDurationMs,
  resolveActivePetAnimation,
  resolvePetFrame,
} from "./codexPetFormat.js";

const NOTIFICATION_ANIMATION: Record<PetNotification["kind"], string> = {
  running: "running",
  waiting: "waiting",
  review: "review",
  failed: "failed",
};

const INTERACTION_ANIMATION_PREFERENCE = [
  "waving",
  "wave",
  "jumping",
  "bounce",
  "running",
  "idle",
] as const;

export interface ManualPetAnimation {
  name: string;
  startedAt: number;
}

export interface AmbientPetFrameState {
  animationName: string;
  spriteIndex: number;
}

/** 点击宠物时优先挥手；自定义宠物缺少该动作时退回其它可见动作。 */
export function pickInteractionAnimation(
  animations: Record<string, PetAnimation>,
): string {
  return (
    INTERACTION_ANIMATION_PREFERENCE.find((name) => Boolean(animations[name])) ?? "idle"
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/**
 * 复刻 Codex 的动画选择与帧计时：通知动画优先于 idle，一次性动画结束回到
 * fallback；关闭动画或系统要求减少动态效果时固定在当前动画首帧。
 */
export function useAmbientPetFrame(
  pet: PetDefinition | null,
  notification: PetNotification | null,
  animationsEnabled: boolean,
  manual: ManualPetAnimation | null,
): AmbientPetFrameState {
  const prefersReducedMotion = usePrefersReducedMotion();
  const idleStartedAtRef = useRef(Date.now());
  const [, setTick] = useState(0);

  const manualName =
    manual && pet?.animations[manual.name] ? manual.name : null;
  const animationName = manualName ?? (notification ? NOTIFICATION_ANIMATION[notification.kind] : "idle");
  const startedAt =
    manualName && manual
      ? manual.startedAt
      : notification
        ? notification.startedAt
        : idleStartedAtRef.current;
  const elapsedMs = Math.max(0, Date.now() - startedAt);

  const animation = pet
    ? resolveActivePetAnimation(pet.animations, animationName, elapsedMs)
    : null;
  const frame = animation ? resolvePetFrame(animation, elapsedMs) : null;
  const frozen = !animationsEnabled || prefersReducedMotion;
  const spriteIndex = frame
    ? frozen
      ? (animation?.frames[0]?.spriteIndex ?? frame.spriteIndex)
      : frame.spriteIndex
    : 0;

  useEffect(() => {
    if (!pet || !animation || !frame || frozen) return;
    let delayMs = frame.delayMs;
    if (delayMs === null && animation.loopStart === null) {
      // 一次性动画停在末帧后仍需一次渲染，才能切到 fallback。
      const remaining = petAnimationDurationMs(animation) - elapsedMs;
      delayMs = remaining > 0 ? remaining : null;
    }
    if (delayMs === null) return;
    const timer = setTimeout(
      () => setTick((value) => value + 1),
      Math.max(16, Math.min(delayMs, 60_000)),
    );
    return () => clearTimeout(timer);
  }, [animation, elapsedMs, frame, frozen, pet]);

  return { animationName, spriteIndex };
}
