import type { PetDesktopPet } from "@zcode/shared";
import type { PetDefinition } from "./contract.js";

/** 主窗口 → 桌面宠物窗口只传渲染必需字段，避免把来源、描述等 UI 状态带过去。 */
export function toPetDesktopPet(pet: PetDefinition | null): PetDesktopPet | null {
  if (!pet) return null;
  return {
    id: pet.id,
    displayName: pet.displayName,
    spritesheetUrl: pet.spritesheetUrl,
    frame: pet.frame,
    frameCount: pet.frameCount,
    animations: pet.animations,
  };
}

export function fromPetDesktopPet(pet: PetDesktopPet): PetDefinition {
  return {
    ...pet,
    description: "",
    source: "desktop",
  };
}
