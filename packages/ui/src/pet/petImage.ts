import { useEffect, useState } from "react";
import { PET_SPRITESHEET_HEIGHT, PET_SPRITESHEET_WIDTH } from "./contract.js";

export type PetImageStatus = "loading" | "ready" | "error";

const statusCache = new Map<string, PetImageStatus>();
const pendingLoads = new Map<string, Promise<PetImageStatus>>();

/** 读取精灵表真实尺寸；供自定义宠物在入库前校验 Codex 固定几何。 */
export function readPetImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image is unavailable in this environment"));
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Failed to load pet spritesheet"));
    image.src = url;
  });
}

function loadStatus(url: string): Promise<PetImageStatus> {
  const pending = pendingLoads.get(url);
  if (pending) return pending;
  const promise = readPetImageDimensions(url)
    .then(({ width, height }) =>
      width === PET_SPRITESHEET_WIDTH && height === PET_SPRITESHEET_HEIGHT ? "ready" : "error",
    )
    .catch(() => "error" as const)
    .then((status) => {
      statusCache.set(url, status);
      pendingLoads.delete(url);
      return status;
    });
  pendingLoads.set(url, promise);
  return promise;
}

/** 预加载并校验精灵表，避免尺寸不正确的宠物把背景渲染成错位帧。 */
export function usePetImageStatus(url: string | null): PetImageStatus {
  const [status, setStatus] = useState<PetImageStatus>(() =>
    !url ? "error" : (statusCache.get(url) ?? "loading"),
  );

  useEffect(() => {
    if (!url) {
      setStatus("error");
      return;
    }
    const cached = statusCache.get(url);
    if (cached) {
      setStatus(cached);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void loadStatus(url).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return status;
}
