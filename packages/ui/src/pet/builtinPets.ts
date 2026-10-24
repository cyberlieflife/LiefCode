import {
  PET_ASSET_CDN_BASE,
  PET_FRAME_COLUMNS,
  PET_FRAME_HEIGHT,
  PET_FRAME_ROWS,
  PET_FRAME_WIDTH,
  type PetDefinition,
} from "./contract.js";
import { buildDefaultPetAnimations } from "./codexPetFormat.js";

export interface BuiltinPetCatalogEntry {
  id: string;
  displayName: string;
  description: string;
  spritesheetFile: string;
}

/** 与 codex-rs `pets/catalog.rs` 的内置目录保持一致。 */
export const BUILTIN_CODEX_PETS: readonly BuiltinPetCatalogEntry[] = [
  {
    id: "codex",
    displayName: "Codex",
    description: "The original Codex companion",
    spritesheetFile: "codex-spritesheet-v4.webp",
  },
  {
    id: "dewey",
    displayName: "Dewey",
    description: "A tidy duck for calm workspace days",
    spritesheetFile: "dewey-spritesheet-v4.webp",
  },
  {
    id: "fireball",
    displayName: "Fireball",
    description: "Hot path energy for fast iteration",
    spritesheetFile: "fireball-spritesheet-v4.webp",
  },
  {
    id: "rocky",
    displayName: "Rocky",
    description: "A steady rock when the diff gets large",
    spritesheetFile: "rocky-spritesheet-v4.webp",
  },
  {
    id: "seedy",
    displayName: "Seedy",
    description: "Small green shoots for new ideas",
    spritesheetFile: "seedy-spritesheet-v4.webp",
  },
  {
    id: "stacky",
    displayName: "Stacky",
    description: "A balanced stack for deep work",
    spritesheetFile: "stacky-spritesheet-v4.webp",
  },
  {
    id: "bsod",
    displayName: "BSOD",
    description: "A tiny blue-screen gremlin",
    spritesheetFile: "bsod-spritesheet-v4.webp",
  },
  {
    id: "null-signal",
    displayName: "Null Signal",
    description: "Quiet signal from the void",
    spritesheetFile: "null-signal-spritesheet-v4.webp",
  },
];

export function builtinPetSpritesheetUrl(spritesheetFile: string): string {
  return `${PET_ASSET_CDN_BASE}/${encodeURIComponent(spritesheetFile)}`;
}

const definitionCache = new Map<string, PetDefinition>();

export function builtinPetDefinition(entry: BuiltinPetCatalogEntry): PetDefinition {
  const cached = definitionCache.get(entry.id);
  if (cached) return cached;
  const definition: PetDefinition = {
    id: entry.id,
    displayName: entry.displayName,
    description: entry.description,
    source: "builtin",
    spritesheetUrl: builtinPetSpritesheetUrl(entry.spritesheetFile),
    frame: {
      width: PET_FRAME_WIDTH,
      height: PET_FRAME_HEIGHT,
      columns: PET_FRAME_COLUMNS,
      rows: PET_FRAME_ROWS,
    },
    frameCount: PET_FRAME_COLUMNS * PET_FRAME_ROWS,
    animations: buildDefaultPetAnimations(),
  };
  definitionCache.set(entry.id, definition);
  return definition;
}

export function listBuiltinPets(): PetDefinition[] {
  return BUILTIN_CODEX_PETS.map(builtinPetDefinition);
}

export function getBuiltinPet(id: string): PetDefinition | null {
  const entry = BUILTIN_CODEX_PETS.find((candidate) => candidate.id === id);
  return entry ? builtinPetDefinition(entry) : null;
}
