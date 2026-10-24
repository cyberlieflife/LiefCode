/**
 * pet 标准调用示例：插件注册自定义宠物来源，宿主合并后即可在选择器中出现。
 */
import type { PetProvider } from "./contract.js";
import { parseCodexPetManifest } from "./codexPetFormat.js";
import { registerPetProvider } from "./petRegistry.js";

export function exampleRegisterStaticPetProvider(manifestJson: string): () => void {
  const manifest = parseCodexPetManifest(JSON.parse(manifestJson), "example");
  const provider: PetProvider = {
    id: "example-static",
    label: "Example",
    async list() {
      return [
        {
          id: "custom:example",
          displayName: manifest.displayName,
          description: manifest.description,
          source: "example",
          spritesheetUrl: "/pets/example-spritesheet.webp",
          frame: manifest.frame,
          frameCount: manifest.frameCount,
          animations: manifest.animations,
        },
      ];
    },
  };
  return registerPetProvider(provider);
}
