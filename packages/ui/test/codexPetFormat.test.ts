import { describe, expect, it } from "vitest";

import {
  PET_FRAME_COLUMNS,
  PET_FRAME_HEIGHT,
  PET_FRAME_ROWS,
  PET_FRAME_WIDTH,
  PET_SPRITESHEET_HEIGHT,
  PET_SPRITESHEET_WIDTH,
} from "@/pet/contract.js";
import {
  PetManifestError,
  buildDefaultPetAnimations,
  idlePetAnimation,
  parseCodexPetManifest,
  petAnimationDurationMs,
  resolveActivePetAnimation,
  resolvePetFrame,
  validatePetSpritesheetLayout,
} from "@/pet/codexPetFormat.js";

describe("parseCodexPetManifest", () => {
  it("applies Codex defaults to a minimal manifest", () => {
    const pet = parseCodexPetManifest({ displayName: "Mini" }, "mini-folder");

    expect(pet.id).toBeNull();
    expect(pet.displayName).toBe("Mini");
    expect(pet.spritesheetPath).toBe("spritesheet.webp");
    expect(pet.frame).toEqual({
      width: PET_FRAME_WIDTH,
      height: PET_FRAME_HEIGHT,
      columns: PET_FRAME_COLUMNS,
      rows: PET_FRAME_ROWS,
    });
    expect(pet.frameCount).toBe(72);
  });

  it("uses the folder id when displayName and id are missing", () => {
    const pet = parseCodexPetManifest({}, "beibeimao");
    expect(pet.displayName).toBe("beibeimao");
  });

  it("keeps the Codex idle timing and running row shape", () => {
    const pet = parseCodexPetManifest({}, "pet");
    const idle = pet.animations.idle;
    expect(idle?.frames.map((frame) => frame.spriteIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(idle?.frames.map((frame) => frame.durationMs)).toEqual([
      1680, 660, 660, 840, 840, 1920,
    ]);

    const running = pet.animations.running;
    expect(running?.frames.slice(0, 6).map((frame) => frame.spriteIndex)).toEqual([
      56, 57, 58, 59, 60, 61,
    ]);
    expect(running?.loopStart).toBe(18);
    expect(running?.fallback).toBe("idle");
  });

  it("accepts a custom grid that covers the fixed spritesheet", () => {
    const pet = parseCodexPetManifest(
      {
        frame: { width: 384, height: 104, columns: 4, rows: 18 },
      },
      "tall",
    );
    expect(pet.frameCount).toBe(72);
    expect(() =>
      validatePetSpritesheetLayout(
        pet.frame,
        PET_SPRITESHEET_WIDTH,
        PET_SPRITESHEET_HEIGHT,
      ),
    ).not.toThrow();
  });

  it("rejects zero frame dimensions and oversized grids", () => {
    expect(() =>
      parseCodexPetManifest(
        { frame: { width: 0, height: 208, columns: 8, rows: 9 } },
        "zero",
      ),
    ).toThrow(PetManifestError);
    expect(() =>
      parseCodexPetManifest(
        { frame: { width: 8, height: 8, columns: 192, rows: 234 } },
        "dense",
      ),
    ).toThrow(/exceeds maximum/);
  });

  it("rejects spritesheet paths that escape the pet directory", () => {
    expect(() =>
      parseCodexPetManifest({ spritesheetPath: "../sheet.webp" }, "escape"),
    ).toThrow(/must stay inside/);
    expect(() =>
      parseCodexPetManifest({ spritesheetPath: "C:\\sheet.webp" }, "escape"),
    ).toThrow(/must stay inside/);
    expect(() =>
      parseCodexPetManifest({ spritesheetPath: "/sheet.webp" }, "escape"),
    ).toThrow(/must stay inside/);
  });

  it("rejects a frame grid that does not cover the spritesheet", () => {
    const pet = parseCodexPetManifest({}, "short");
    expect(() =>
      validatePetSpritesheetLayout(pet.frame, PET_SPRITESHEET_WIDTH, 1000),
    ).toThrow(/spritesheet must be/);
    expect(() =>
      validatePetSpritesheetLayout(
        { ...pet.frame, columns: 7 },
        PET_SPRITESHEET_WIDTH,
        PET_SPRITESHEET_HEIGHT,
      ),
    ).toThrow(/must cover spritesheet exactly/);
  });

  it("applies custom animation fps, loop and fallback", () => {
    const pet = parseCodexPetManifest(
      {
        animations: {
          custom: { frames: [1, 2], fps: 2, loop: false, fallback: "idle" },
        },
      },
      "custom",
    );
    const custom = pet.animations.custom;
    expect(custom?.frames.map((frame) => frame.durationMs)).toEqual([500, 500]);
    expect(custom?.loopStart).toBeNull();
    expect(custom?.fallback).toBe("idle");
  });

  it("rejects invalid animation declarations", () => {
    expect(() =>
      parseCodexPetManifest({ animations: { idle: { frames: [] } } }, "empty"),
    ).toThrow(/at least one frame/);
    expect(() =>
      parseCodexPetManifest({ animations: { idle: { frames: [72] } } }, "outside"),
    ).toThrow(/references sprite index 72/);
    expect(() =>
      parseCodexPetManifest({ animations: { idle: { frames: [0], fps: 120 } } }, "fast"),
    ).toThrow(/fps must be/);
    expect(() =>
      parseCodexPetManifest(
        { animations: { wave: { frames: [1], loop: false, fallback: "missing" } } },
        "fallback",
      ),
    ).toThrow(/fallback missing does not exist/);
  });
});

describe("resolvePetFrame", () => {
  it("walks idle frames with their individual durations", () => {
    const idle = idlePetAnimation();
    expect(resolvePetFrame(idle, 0)).toEqual({ spriteIndex: 0, delayMs: 1680 });
    expect(resolvePetFrame(idle, 1680)).toEqual({ spriteIndex: 1, delayMs: 660 });
    expect(resolvePetFrame(idle, 1680 + 660 + 1)).toEqual({
      spriteIndex: 2,
      delayMs: 659,
    });
  });

  it("repeats state animations three times before looping the idle tail", () => {
    const running = buildDefaultPetAnimations().running;
    expect(running).toBeDefined();
    if (!running) return;
    const primaryMs = petAnimationDurationMs({
      ...running,
      frames: running.frames.slice(0, 6),
    });
    const prefixMs = primaryMs * 3;
    expect(petAnimationDurationMs(running)).toBe(prefixMs + 6600);

    expect(resolvePetFrame(running, 0)).toEqual({ spriteIndex: 56, delayMs: 120 });
    expect(resolvePetFrame(running, prefixMs)).toEqual({ spriteIndex: 0, delayMs: 1680 });
    expect(resolvePetFrame(running, prefixMs + 100)).toEqual({
      spriteIndex: 0,
      delayMs: 1580,
    });
  });

  it("stops one-shot animations on the final frame and falls back", () => {
    const pet = parseCodexPetManifest(
      {
        animations: {
          once: { frames: [1, 2], fps: 2, loop: false, fallback: "idle" },
        },
      },
      "once",
    );
    const once = pet.animations.once;
    expect(once).toBeDefined();
    if (!once) return;
    expect(resolvePetFrame(once, 600)).toEqual({ spriteIndex: 2, delayMs: 400 });
    expect(resolvePetFrame(once, 1000)).toEqual({ spriteIndex: 2, delayMs: null });
    expect(resolveActivePetAnimation(pet.animations, "once", 1000)).toBe(
      pet.animations.idle,
    );
    expect(resolveActivePetAnimation(pet.animations, "missing", 0)).toBe(
      pet.animations.idle,
    );
  });
});
