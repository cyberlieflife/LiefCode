import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPetBroadcast,
  createPetStoreSlice,
  normalizePetAnimationsEnabled,
  normalizePetDesktopEnabled,
  normalizePetId,
  normalizePetSizePx,
  type PetSlice,
} from "@/pet/storeSlice.js";

const setItem = vi.fn();

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem,
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  });
  setItem.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pet store slice", () => {
  it("normalizes unknown preferences to defaults", () => {
    expect(normalizePetId(undefined)).toBe("codex");
    expect(normalizePetId("  custom:mini  ")).toBe("custom:mini");
    expect(normalizePetAnimationsEnabled(undefined)).toBe(true);
    expect(normalizePetAnimationsEnabled("false")).toBe(false);
    expect(normalizePetDesktopEnabled(undefined)).toBe(true);
    expect(normalizePetDesktopEnabled("false")).toBe(false);
    expect(normalizePetSizePx(undefined)).toBe(160);
    expect(normalizePetSizePx(20)).toBe(96);
    expect(normalizePetSizePx(999)).toBe(256);
    expect(normalizePetSizePx("184")).toBe(184);
  });

  it("persists and writes each field through the store patch", () => {
    const patches: Array<Partial<PetSlice>> = [];
    const slice = createPetStoreSlice({
      readState: () => slice,
      writeState: (patch) => patches.push(patch),
    });

    slice.setPetId("custom:mini");
    slice.setPetAnimationsEnabled(false);
    slice.setPetDesktopEnabled(false);
    slice.setPetSizePx(200);

    expect(setItem).toHaveBeenCalledWith("zcode-pet-id", "custom:mini");
    expect(setItem).toHaveBeenCalledWith("zcode-pet-animations", "false");
    expect(setItem).toHaveBeenCalledWith("zcode-pet-desktop-enabled", "false");
    expect(setItem).toHaveBeenCalledWith("zcode-pet-size-px", "200");
    expect(patches).toEqual([
      { petId: "custom:mini" },
      { petAnimationsEnabled: false },
      { petDesktopEnabled: false },
      { petSizePx: 200 },
    ]);
  });

  it("routes broadcast payloads only when their type matches", () => {
    const calls: string[] = [];
    const setters = {
      setPetId: (petId: string) => calls.push(`id:${petId}`),
      setPetAnimationsEnabled: (enabled: boolean) => calls.push(`animations:${enabled}`),
      setPetDesktopEnabled: (enabled: boolean) => calls.push(`desktop:${enabled}`),
      setPetSizePx: (sizePx: number) => calls.push(`size:${sizePx}`),
    } as unknown as Pick<
      PetSlice,
      "setPetId" | "setPetAnimationsEnabled" | "setPetDesktopEnabled" | "setPetSizePx"
    >;

    applyPetBroadcast(setters, "petId", "custom:mini");
    applyPetBroadcast(setters, "petAnimationsEnabled", false);
    applyPetBroadcast(setters, "petDesktopEnabled", false);
    applyPetBroadcast(setters, "petSizePx", 200);
    applyPetBroadcast(setters, "petId", 42);
    applyPetBroadcast(setters, "petDesktopEnabled", "invalid");

    expect(calls).toEqual([
      "id:custom:mini",
      "animations:false",
      "desktop:false",
      "size:200",
    ]);
  });
});
