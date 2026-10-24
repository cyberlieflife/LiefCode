import { logger } from "@/logger.js";
import {
  PET_CODEX_HOME_SOURCES,
  type PetDefinition,
  type PetHostPort,
  type PetProvider,
} from "./contract.js";
import {
  PetManifestError,
  parseCodexPetManifest,
  validatePetSpritesheetLayout,
} from "./codexPetFormat.js";
import { readPetImageDimensions } from "./petImage.js";

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SPRITESHEET_BYTES = 4 * 1024 * 1024;

/** 只拼接宿主返回的绝对路径；全部使用正斜杠，Node 与远程 POSIX 都能解析。 */
function joinHostPath(base: string, ...parts: string[]): string {
  const normalizedBase = base.replace(/[\\/]+$/u, "");
  const normalizedParts = parts.map((part) => part.replace(/^[\\/]+/u, ""));
  return `${normalizedBase}/${normalizedParts.join("/")}`;
}

async function loadPetDirectory(
  host: PetHostPort,
  petDirectory: string,
  folderName: string,
  manifestFile: string,
): Promise<PetDefinition | null> {
  const manifestPath = joinHostPath(petDirectory, manifestFile);
  const manifestContent = await host.readTextFile(manifestPath, MAX_MANIFEST_BYTES);
  let raw: unknown;
  try {
    raw = JSON.parse(manifestContent) as unknown;
  } catch {
    throw new PetManifestError("manifest is not valid JSON");
  }
  const manifest = parseCodexPetManifest(raw, folderName);
  const relativeSheetPath = manifest.spritesheetPath.replace(/\\/gu, "/");
  const spritesheetPath = joinHostPath(petDirectory, relativeSheetPath);
  const preview = await host.readAsset(spritesheetPath, MAX_SPRITESHEET_BYTES);
  const dataUrl = `data:${preview.mediaType};base64,${preview.dataBase64}`;
  const dimensions = await readPetImageDimensions(dataUrl);
  validatePetSpritesheetLayout(manifest.frame, dimensions.width, dimensions.height);

  return {
    id: `custom:${folderName}`,
    displayName: manifest.displayName,
    description: manifest.description,
    source: "codex-home",
    spritesheetUrl: dataUrl,
    frame: manifest.frame,
    frameCount: manifest.frameCount,
    animations: manifest.animations,
  };
}

async function listDirectoryPets(
  host: PetHostPort,
  home: string,
  directory: string,
  manifestFile: string,
): Promise<PetDefinition[]> {
  const sourcePath = joinHostPath(home, directory);
  const entries = await host
    .listDirectory(sourcePath)
    // 目录不存在是正常情况：用户可能只使用内置宠物。
    .catch(() => []);

  const pets: PetDefinition[] = [];
  for (const entry of entries) {
    if (entry.type !== "directory") continue;
    try {
      const pet = await loadPetDirectory(host, entry.path, entry.name, manifestFile);
      if (pet) pets.push(pet);
    } catch (error) {
      logger.warn("[pet] 跳过无法加载的自定义宠物", {
        folder: entry.name,
        reason:
          error instanceof PetManifestError ? error.message : "无法读取清单或精灵表",
      });
    }
  }
  return pets;
}

/**
 * Codex 自定义宠物来源：读取 `~/.codex/pets`、旧版 `~/.codex/avatars`
 * 以及本项目扩展目录 `~/.zcode/pets`。目录内格式与 Codex 完全一致。
 */
export const codexHomePetProvider: PetProvider = {
  id: "codex-home",
  label: "Codex home",
  async list({ host }) {
    const home = await host.homeDirectory();
    if (!home) return [];
    const byFolder = new Map<string, PetDefinition>();
    for (const source of PET_CODEX_HOME_SOURCES) {
      const pets = await listDirectoryPets(host, home, source.dir, source.manifest);
      for (const pet of pets) {
        // 后扫描的目录覆盖同名宠物：avatars → pets → .zcode/pets。
        byFolder.set(pet.id, pet);
      }
    }
    return [...byFolder.values()];
  },
};
