import {
  PET_DEFAULT_FPS,
  PET_DEFAULT_SPRITESHEET,
  PET_FRAME_COLUMNS,
  PET_FRAME_HEIGHT,
  PET_FRAME_ROWS,
  PET_FRAME_WIDTH,
  PET_MAX_FPS,
  PET_MAX_FRAMES,
  PET_SPRITESHEET_HEIGHT,
  PET_SPRITESHEET_WIDTH,
  type PetAnimation,
  type PetAnimationFrame,
  type PetFrameSpec,
} from "./contract.js";

export class PetManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PetManifestError";
  }
}

export interface ParsedCodexPetManifest {
  /** 清单显式声明且非空的 id；缺省时由目录名决定。 */
  id: string | null;
  displayName: string;
  description: string;
  spritesheetPath: string;
  frame: PetFrameSpec;
  frameCount: number;
  animations: Record<string, PetAnimation>;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PetManifestError(`${field} must be an object`);
  }
  return value as JsonObject;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new PetManifestError(`${field} must be a string`);
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new PetManifestError(`${field} must be a positive integer`);
  }
  return value;
}

function parseFrameSpec(value: unknown): PetFrameSpec {
  if (value === undefined || value === null) {
    return {
      width: PET_FRAME_WIDTH,
      height: PET_FRAME_HEIGHT,
      columns: PET_FRAME_COLUMNS,
      rows: PET_FRAME_ROWS,
    };
  }
  const frame = asObject(value, "frame");
  const parsed: PetFrameSpec = {
    width: positiveInteger(frame.width, "frame.width"),
    height: positiveInteger(frame.height, "frame.height"),
    columns: positiveInteger(frame.columns, "frame.columns"),
    rows: positiveInteger(frame.rows, "frame.rows"),
  };
  const frameCount = parsed.columns * parsed.rows;
  if (frameCount > PET_MAX_FRAMES) {
    throw new PetManifestError(`pet frame count ${frameCount} exceeds maximum ${PET_MAX_FRAMES}`);
  }
  return parsed;
}

/**
 * 清单只接受宠物目录内的相对路径；绝对路径、盘符和 `..` 都会越出用户自己的宠物目录。
 */
function parseSpritesheetPath(value: unknown): string {
  const raw = optionalString(value, "spritesheetPath");
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return PET_DEFAULT_SPRITESHEET;
  const components = trimmed.split(/[\\/]/);
  if (
    /^[a-zA-Z]:/.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    components.includes("..")
  ) {
    throw new PetManifestError("spritesheet path must stay inside the pet directory");
  }
  return trimmed;
}

function parseAnimationFrames(value: unknown, name: string, frameCount: number): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PetManifestError(`animation ${name} must include at least one frame`);
  }
  return value.map((entry) => {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0) {
      throw new PetManifestError(`animation ${name} frame index must be a non-negative integer`);
    }
    if (entry >= frameCount) {
      throw new PetManifestError(
        `animation ${name} references sprite index ${entry}, but pet has ${frameCount} frames`,
      );
    }
    return entry;
  });
}

function parseAnimationFps(value: unknown, name: string): number {
  if (value === undefined || value === null) return PET_DEFAULT_FPS;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > PET_MAX_FPS) {
    throw new PetManifestError(
      `animation ${name} fps must be finite and between 0 and ${PET_MAX_FPS}`,
    );
  }
  return value;
}

function parseAnimations(
  value: unknown,
  frameCount: number,
): Record<string, PetAnimation> {
  const defaults = buildDefaultPetAnimations();
  if (value === undefined || value === null) {
    validatePetAnimations(defaults, frameCount);
    return defaults;
  }
  const specs = asObject(value, "animations");
  if (Object.keys(specs).length === 0) {
    validatePetAnimations(defaults, frameCount);
    return defaults;
  }

  const animations: Record<string, PetAnimation> = { ...defaults };
  for (const [name, rawSpec] of Object.entries(specs)) {
    const animationName = name.trim();
    if (!animationName) throw new PetManifestError("animation name must not be empty");
    const spec = asObject(rawSpec, `animations.${animationName}`);
    const spriteIndices = parseAnimationFrames(spec.frames, animationName, frameCount);
    const fps = parseAnimationFps(spec.fps, animationName);
    const loop = spec.loop === undefined ? true : spec.loop;
    if (typeof loop !== "boolean") {
      throw new PetManifestError(`animation ${animationName} loop must be a boolean`);
    }
    const fallback = (optionalString(spec.fallback, `animations.${animationName}.fallback`) ?? "")
      .trim() || "idle";
    const frameDurationMs = 1000 / fps;
    animations[animationName] = {
      frames: spriteIndices.map((spriteIndex) => ({
        spriteIndex,
        durationMs: frameDurationMs,
      })),
      loopStart: loop ? 0 : null,
      fallback,
    };
  }

  animations.idle ??= idlePetAnimation();
  validatePetAnimations(animations, frameCount);
  return animations;
}

export function validatePetAnimations(
  animations: Record<string, PetAnimation>,
  frameCount: number,
): void {
  for (const [name, animation] of Object.entries(animations)) {
    if (animation.frames.length === 0) {
      throw new PetManifestError(`animation ${name} must include at least one frame`);
    }
    for (const frame of animation.frames) {
      if (
        !Number.isInteger(frame.spriteIndex) ||
        frame.spriteIndex < 0 ||
        frame.spriteIndex >= frameCount
      ) {
        throw new PetManifestError(
          `animation ${name} references sprite index ${frame.spriteIndex}, but pet has ${frameCount} frames`,
        );
      }
      if (!(frame.durationMs > 0)) {
        throw new PetManifestError(`animation ${name} frame duration must be positive`);
      }
    }
    if (!animations[animation.fallback]) {
      throw new PetManifestError(`animation ${name} fallback ${animation.fallback} does not exist`);
    }
  }
}

/**
 * 解析 Codex 的 pet.json / avatar.json。字段名、默认值、类型约束与
 * codex-rs `pets/model.rs` 保持一致，便于直接复用用户已有的宠物目录。
 */
export function parseCodexPetManifest(
  raw: unknown,
  fallbackId: string,
): ParsedCodexPetManifest {
  const manifest = asObject(raw, "pet manifest");
  const explicitId = (optionalString(manifest.id, "id") ?? "").trim();
  const id = explicitId || null;
  const displayName =
    (optionalString(manifest.displayName, "displayName") ?? "").trim() || id || fallbackId;
  const description = (optionalString(manifest.description, "description") ?? "").trim();
  const spritesheetPath = parseSpritesheetPath(manifest.spritesheetPath);
  const frame = parseFrameSpec(manifest.frame);
  const frameCount = frame.columns * frame.rows;
  const animations = parseAnimations(manifest.animations, frameCount);
  return {
    id,
    displayName,
    description,
    spritesheetPath,
    frame,
    frameCount,
    animations,
  };
}

/** 校验精灵表尺寸以及帧网格是否恰好覆盖整张图。 */
export function validatePetSpritesheetLayout(
  frame: PetFrameSpec,
  imageWidth: number,
  imageHeight: number,
): void {
  if (imageWidth !== PET_SPRITESHEET_WIDTH || imageHeight !== PET_SPRITESHEET_HEIGHT) {
    throw new PetManifestError(
      `spritesheet must be ${PET_SPRITESHEET_WIDTH}x${PET_SPRITESHEET_HEIGHT} pixels, got ${imageWidth}x${imageHeight}`,
    );
  }
  const gridWidth = frame.width * frame.columns;
  const gridHeight = frame.height * frame.rows;
  if (gridWidth !== imageWidth || gridHeight !== imageHeight) {
    throw new PetManifestError(
      `pet frame grid must cover spritesheet exactly: expected ${imageWidth}x${imageHeight}, got ${gridWidth}x${gridHeight}`,
    );
  }
}

export function idlePetAnimation(): PetAnimation {
  const frames: PetAnimationFrame[] = [
    { spriteIndex: 0, durationMs: 1680 },
    { spriteIndex: 1, durationMs: 660 },
    { spriteIndex: 2, durationMs: 660 },
    { spriteIndex: 3, durationMs: 840 },
    { spriteIndex: 4, durationMs: 840 },
    { spriteIndex: 5, durationMs: 1920 },
  ];
  return { frames, loopStart: 0, fallback: "idle" };
}

function appStatePetAnimation(
  rowIndex: number,
  frameCount: number,
  frameDurationMs: number,
  finalFrameDurationMs: number,
): PetAnimation {
  const primary = Array.from({ length: frameCount }, (_, columnIndex) => ({
    spriteIndex: rowIndex * PET_FRAME_COLUMNS + columnIndex,
    durationMs: columnIndex === frameCount - 1 ? finalFrameDurationMs : frameDurationMs,
  }));
  const idle = idlePetAnimation();
  return {
    // 与 Codex 一致：状态动画连续播放三遍，然后进入 idle 循环。
    frames: [...primary, ...primary, ...primary, ...idle.frames],
    loopStart: primary.length * 3,
    fallback: "idle",
  };
}

/** 未声明 animations 时使用 Codex 的 9 行动画表。 */
export function buildDefaultPetAnimations(): Record<string, PetAnimation> {
  return {
    idle: idlePetAnimation(),
    "running-right": appStatePetAnimation(1, 8, 120, 220),
    "running-left": appStatePetAnimation(2, 8, 120, 220),
    waving: appStatePetAnimation(3, 4, 140, 280),
    jumping: appStatePetAnimation(4, 5, 140, 280),
    failed: appStatePetAnimation(5, 8, 140, 240),
    waiting: appStatePetAnimation(6, 6, 150, 260),
    running: appStatePetAnimation(7, 6, 120, 220),
    review: appStatePetAnimation(8, 6, 150, 280),
    // Codex 同时接受简短别名，方便自定义清单直接引用行语义。
    move_right: appStatePetAnimation(1, 8, 120, 220),
    move_left: appStatePetAnimation(2, 8, 120, 220),
    wave: appStatePetAnimation(3, 4, 140, 280),
    bounce: appStatePetAnimation(4, 5, 140, 280),
    sad: appStatePetAnimation(5, 8, 140, 240),
  };
}

export function petAnimationDurationMs(animation: PetAnimation): number {
  return animation.frames.reduce((total, frame) => total + frame.durationMs, 0);
}

export interface PetFrameTick {
  spriteIndex: number;
  /** 距离下一帧的毫秒数；null 表示该动画已停在最后一帧。 */
  delayMs: number | null;
}

function frameAtElapsed(animation: PetAnimation, elapsedMs: number): PetFrameTick | null {
  let remaining = elapsedMs;
  for (const frame of animation.frames) {
    const duration = Math.max(frame.durationMs, 0.001);
    if (remaining < duration) {
      return { spriteIndex: frame.spriteIndex, delayMs: duration - remaining };
    }
    remaining -= duration;
  }
  const last = animation.frames[animation.frames.length - 1];
  return last ? { spriteIndex: last.spriteIndex, delayMs: null } : null;
}

/**
 * Codex 的帧选择算法：一次性动画停在末帧；带 loopStart 的动画先播放前缀，
 * 超过总时长后只循环 loopStart 之后的部分。
 */
export function resolvePetFrame(animation: PetAnimation, elapsedMs: number): PetFrameTick | null {
  if (animation.frames.length === 0) return null;
  if (animation.frames.length <= 1) {
    const only = animation.frames[0];
    return only ? { spriteIndex: only.spriteIndex, delayMs: null } : null;
  }

  const totalMs = petAnimationDurationMs(animation);
  const loopStart = animation.loopStart;
  if (loopStart !== null && loopStart < animation.frames.length) {
    if (elapsedMs >= totalMs) {
      const prefixMs = animation.frames
        .slice(0, loopStart)
        .reduce((total, frame) => total + frame.durationMs, 0);
      const loopMs = animation.frames
        .slice(loopStart)
        .reduce((total, frame) => total + frame.durationMs, 0);
      const effective =
        loopMs > 0 ? prefixMs + Math.max(0, elapsedMs - prefixMs) % loopMs : elapsedMs;
      return frameAtElapsed(animation, effective);
    }
    return frameAtElapsed(animation, elapsedMs);
  }

  if (elapsedMs >= totalMs) {
    const last = animation.frames[animation.frames.length - 1];
    return last ? { spriteIndex: last.spriteIndex, delayMs: null } : null;
  }
  return frameAtElapsed(animation, elapsedMs);
}

/**
 * 选出当前应播放的动画：请求的动画缺失时回退 idle；一次性动画播放完后
 * 切换到声明的 fallback（与 Codex 一样保留原始 elapsed，由 fallback 自己决定循环相位）。
 */
export function resolveActivePetAnimation(
  animations: Record<string, PetAnimation>,
  requestedName: string,
  elapsedMs: number,
): PetAnimation | null {
  const requested = animations[requestedName] ?? animations.idle ?? Object.values(animations)[0];
  if (!requested) return null;
  if (requested.loopStart === null && elapsedMs >= petAnimationDurationMs(requested)) {
    return animations[requested.fallback] ?? animations.idle ?? requested;
  }
  return requested;
}
