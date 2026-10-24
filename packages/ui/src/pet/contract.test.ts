import { describe, expect, it } from "vitest";

import {
  PET_FRAME_COLUMNS,
  PET_FRAME_HEIGHT,
  PET_FRAME_ROWS,
  PET_FRAME_WIDTH,
} from "./contract.js";
import { parseCodexPetManifest } from "./codexPetFormat.js";
import { petModule } from "./module.js";

describe("pet contract", () => {
  it("declares its module manifest", () => {
    expect(petModule.id).toBe("pet");
    expect(petModule.publicEntrypoints).toContain("index.ts");
  });

  it("parses a minimal Codex manifest with the app defaults", () => {
    const manifest = parseCodexPetManifest(
      {
        displayName: "Mini",
        spritesheetPath: "spritesheet.webp",
      },
      "mini",
    );

    expect(manifest.displayName).toBe("Mini");
    expect(manifest.frame).toEqual({
      width: PET_FRAME_WIDTH,
      height: PET_FRAME_HEIGHT,
      columns: PET_FRAME_COLUMNS,
      rows: PET_FRAME_ROWS,
    });
    expect(manifest.frameCount).toBe(PET_FRAME_COLUMNS * PET_FRAME_ROWS);
    expect(manifest.animations.idle?.frames.map((frame) => frame.spriteIndex)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});
