import type { useServices } from "@/hooks/useServices.js";
import type { PetHostPort } from "./contract.js";

type Services = ReturnType<typeof useServices>;

/**
 * 把宿主服务适配成宠物模块的窄端口。读取上限由调用方决定，
 * 这里只做参数透传，不在 UI 层判断宠物格式。
 */
export function createPetHostPort(services: Services): PetHostPort {
  return {
    async homeDirectory() {
      try {
        const info = await services.systemService.info();
        return info.homedir?.trim() || null;
      } catch {
        return null;
      }
    },
    listDirectory: (path) => services.fileService.readdir({ path }),
    async readTextFile(path, maxBytes) {
      const slice = await services.fileService.readTextFile({ path, length: maxBytes });
      if (slice.truncated) throw new Error("文件超出读取上限");
      return slice.content;
    },
    async readAsset(path, maxBytes) {
      const preview = await services.fileService.readMediaPreview({ path, maxBytes });
      return { mediaType: preview.mediaType, dataBase64: preview.dataBase64 };
    },
  };
}
