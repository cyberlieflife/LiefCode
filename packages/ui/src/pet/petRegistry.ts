import { logger } from "@/logger.js";
import { builtinPetDefinition, BUILTIN_CODEX_PETS } from "./builtinPets.js";
import { codexHomePetProvider } from "./codexHomeProvider.js";
import type { PetDefinition, PetProvider, PetProviderContext } from "./contract.js";

const providers = new Map<string, PetProvider>();

/**
 * 注册额外的宠物来源；返回注销函数。重复注册同一 id 时后注册者生效，
 * 便于宿主或插件覆盖默认来源而不修改核心代码。
 */
export function registerPetProvider(provider: PetProvider): () => void {
  const id = provider.id.trim();
  if (!id) throw new Error("Pet provider id must not be empty");
  providers.set(id, provider);
  return () => {
    if (providers.get(id) === provider) providers.delete(id);
  };
}

export function listPetProviders(): PetProvider[] {
  return [...providers.values()];
}

export const builtinPetProvider: PetProvider = {
  id: "builtin",
  label: "Built-in",
  async list() {
    return BUILTIN_CODEX_PETS.map(builtinPetDefinition);
  },
};

// 内置目录与 Codex home 默认可用；第三方通过 registerPetProvider 追加。
registerPetProvider(builtinPetProvider);
registerPetProvider(codexHomePetProvider);

/**
 * 合并所有来源。单个 provider 失败不影响其它来源；同 id 以后注册的来源为准。
 */
export async function listPets(context: PetProviderContext): Promise<PetDefinition[]> {
  const merged = new Map<string, PetDefinition>();
  for (const provider of providers.values()) {
    try {
      const pets = await provider.list(context);
      for (const pet of pets) merged.set(pet.id, pet);
    } catch (error) {
      logger.warn("[pet] 宠物来源加载失败", {
        provider: provider.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return [...merged.values()];
}

/** 测试或多账户切换时清空注册表，只保留内置来源与 Codex home。 */
export function resetPetProvidersForTests(): void {
  providers.clear();
  registerPetProvider(builtinPetProvider);
  registerPetProvider(codexHomePetProvider);
}
