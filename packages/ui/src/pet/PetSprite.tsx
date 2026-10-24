import type { CSSProperties } from "react";
import { PET_DISPLAY_HEIGHT_PX, type PetDefinition } from "./contract.js";

export interface PetSpriteProps {
  pet: PetDefinition;
  spriteIndex: number;
  heightPx?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * 用 background-position 显示精灵表中的单帧。帧顺序与 Codex 一致：
 * 从左到右、从上到下；索引超出网格时取最后一帧，避免自定义清单越界时报错。
 */
export function PetSprite({
  pet,
  spriteIndex,
  heightPx = PET_DISPLAY_HEIGHT_PX,
  className,
  style,
}: PetSpriteProps) {
  const columns = Math.max(1, pet.frame.columns);
  const rows = Math.max(1, pet.frame.rows);
  const clampedIndex = Math.min(Math.max(0, spriteIndex), pet.frameCount - 1);
  const column = clampedIndex % columns;
  const row = Math.min(rows - 1, Math.floor(clampedIndex / columns));
  const x = columns > 1 ? (column / (columns - 1)) * 100 : 0;
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  const width = Math.round((heightPx * pet.frame.width) / pet.frame.height);

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        width,
        height: heightPx,
        backgroundImage: `url("${pet.spritesheetUrl}")`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${x}% ${y}%`,
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}
