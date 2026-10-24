import { useCallback, useEffect, useMemo, useState } from "react";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { getBuiltinPet, listBuiltinPets } from "./builtinPets.js";
import { PET_DISABLED_ID, type PetDefinition, type PetHostPort } from "./contract.js";
import { createPetHostPort } from "./petHostPort.js";
import { listPets } from "./petRegistry.js";
import { readStoredPetId } from "./storeSlice.js";

const CATALOG_CACHE_TTL_MS = 30_000;

interface PetCatalogCacheEntry {
  host: PetHostPort;
  promise: Promise<PetDefinition[]>;
  loadedAt: number;
}

let catalogCache: PetCatalogCacheEntry | null = null;
let adoptedCodexHomePet = false;

interface PetCatalogState {
  pets: PetDefinition[];
  loading: boolean;
  error: string | null;
}

function adoptCodexHomePetIfNeeded(
  pets: PetDefinition[],
  setPetId: (petId: string) => void,
): void {
  // 只在用户从未主动选择过宠物时接管：已有偏好（包括 disabled）永远优先。
  if (adoptedCodexHomePet || readStoredPetId()) {
    adoptedCodexHomePet = true;
    return;
  }
  const customPet = pets.find((pet) => pet.source === "codex-home");
  if (!customPet) return;
  adoptedCodexHomePet = true;
  setPetId(customPet.id);
}

export function invalidatePetCatalog(): void {
  catalogCache = null;
}

/** 合并内置宠物与所有已注册来源；同一 host 上并发调用共享同一次扫描。 */
export function loadPetCatalog(host: PetHostPort, force = false): Promise<PetDefinition[]> {
  if (
    !force &&
    catalogCache &&
    catalogCache.host === host &&
    Date.now() - catalogCache.loadedAt < CATALOG_CACHE_TTL_MS
  ) {
    return catalogCache.promise;
  }

  const promise = listPets({ host });
  catalogCache = { host, promise, loadedAt: Date.now() };
  promise.catch(() => {
    if (catalogCache?.promise === promise) catalogCache = null;
  });
  return promise;
}

export function usePetCatalog(enabled = true): PetCatalogState & {
  reload: () => void;
} {
  const services = useServices();
  const host = useMemo(() => createPetHostPort(services), [services]);
  const setPetId = useZCodeStore((state) => state.setPetId);
  const [state, setState] = useState<PetCatalogState>(() => ({
    pets: listBuiltinPets(),
    loading: enabled,
    error: null,
  }));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    void loadPetCatalog(host).then(
      (pets) => {
        adoptCodexHomePetIfNeeded(pets, setPetId);
        if (!cancelled) setState({ pets, loading: false, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, host, setPetId]);

  const reload = useCallback(() => {
    invalidatePetCatalog();
    setState((current) => ({ ...current, loading: true, error: null }));
    void loadPetCatalog(host, true).then(
      (pets) => {
        adoptCodexHomePetIfNeeded(pets, setPetId);
        setState({ pets, loading: false, error: null });
      },
      (error: unknown) =>
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })),
    );
  }, [host, setPetId]);

  return { ...state, reload };
}

/** 内置宠物无需扫描目录；只有自定义或第三方来源才等待目录加载。 */
export function useResolvedPet(petId: string): {
  pet: PetDefinition | null;
  loading: boolean;
  error: string | null;
} {
  const builtin = getBuiltinPet(petId);
  const needsCatalog = petId !== PET_DISABLED_ID;
  // 始终扫描一次：首次启动时才能发现 Codex 自定义宠物并完成接管。
  // 扫描结果按 host 缓存，多个 pane 共享同一次读取。
  const catalog = usePetCatalog(needsCatalog);
  const pet = builtin ?? catalog.pets.find((candidate) => candidate.id === petId) ?? null;
  return {
    pet,
    loading: !builtin && needsCatalog && catalog.loading,
    error: !builtin && needsCatalog ? catalog.error : null,
  };
}
