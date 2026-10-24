import { afterEach, describe, expect, it } from "vitest";

import { buildDefaultPetAnimations } from "@/pet/codexPetFormat.js";
import type { PetDefinition, PetHostPort, PetProvider } from "@/pet/contract.js";
import {
  listPetProviders,
  listPets,
  registerPetProvider,
  resetPetProvidersForTests,
} from "@/pet/petRegistry.js";

const unavailableHost: PetHostPort = {
  homeDirectory: async () => null,
  listDirectory: async () => [],
  readTextFile: async () => "",
  readAsset: async () => ({ mediaType: "image/webp", dataBase64: "" }),
};

function pet(id: string, displayName: string): PetDefinition {
  return {
    id,
    displayName,
    description: "",
    source: "test",
    spritesheetUrl: "data:image/webp;base64,",
    frame: { width: 192, height: 208, columns: 8, rows: 9 },
    frameCount: 72,
    animations: buildDefaultPetAnimations(),
  };
}

function provider(id: string, pets: PetDefinition[]): PetProvider {
  return { id, list: async () => pets };
}

afterEach(() => {
  resetPetProvidersForTests();
});

describe("petRegistry", () => {
  it("always exposes the built-in catalog when the host has no Codex home", async () => {
    resetPetProvidersForTests();
    const pets = await listPets({ host: unavailableHost });
    expect(pets.map((candidate) => candidate.id)).toContain("codex");
    expect(pets).toHaveLength(8);
  });

  it("merges registered providers and lets later providers override duplicates", async () => {
    resetPetProvidersForTests();
    const unregisterFirst = registerPetProvider(
      provider("first", [pet("custom:same", "First")]),
    );
    registerPetProvider(provider("second", [pet("custom:same", "Second")]));

    const pets = await listPets({ host: unavailableHost });
    expect(pets.find((candidate) => candidate.id === "custom:same")?.displayName).toBe(
      "Second",
    );

    unregisterFirst();
    expect(listPetProviders().some((candidate) => candidate.id === "first")).toBe(false);
  });

  it("isolates provider failures", async () => {
    resetPetProvidersForTests();
    registerPetProvider({
      id: "broken",
      list: async () => {
        throw new Error("provider failed");
      },
    });
    const pets = await listPets({ host: unavailableHost });
    expect(pets.length).toBe(8);
  });
});
