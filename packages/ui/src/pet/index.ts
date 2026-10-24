export { DesktopPetView, type DesktopPetWindowBridge } from "./DesktopPetView.js";
export { PetDesktopStatusPublisher } from "./PetDesktopStatusPublisher.js";
export { PetSettingsSection } from "./PetSettingsSection.js";
export { PetSprite, type PetSpriteProps } from "./PetSprite.js";
export { fromPetDesktopPet, toPetDesktopPet } from "./desktopPetPayload.js";
export {
  BUILTIN_CODEX_PETS,
  builtinPetDefinition,
  builtinPetSpritesheetUrl,
  getBuiltinPet,
  listBuiltinPets,
  type BuiltinPetCatalogEntry,
} from "./builtinPets.js";
export {
  PetManifestError,
  buildDefaultPetAnimations,
  idlePetAnimation,
  parseCodexPetManifest,
  petAnimationDurationMs,
  resolveActivePetAnimation,
  resolvePetFrame,
  validatePetAnimations,
  validatePetSpritesheetLayout,
  type ParsedCodexPetManifest,
  type PetFrameTick,
} from "./codexPetFormat.js";
export {
  PET_ASSET_CDN_BASE,
  PET_CODEX_HOME_SOURCES,
  PET_CUSTOM_PREFIX,
  PET_DEFAULT_FPS,
  PET_DEFAULT_PET_ID,
  PET_DEFAULT_SPRITESHEET,
  PET_DISABLED_ID,
  PET_DISPLAY_HEIGHT_PX,
  PET_FRAME_COLUMNS,
  PET_FRAME_HEIGHT,
  PET_FRAME_ROWS,
  PET_FRAME_WIDTH,
  PET_MAX_FPS,
  PET_MAX_FRAMES,
  PET_TASK_CARD_LIFETIME_MS,
  PET_SPRITESHEET_HEIGHT,
  PET_SPRITESHEET_WIDTH,
  type PetAnimation,
  type PetAnimationFrame,
  type PetDefinition,
  type PetFrameSpec,
  type PetHostDirectoryEntry,
  type PetHostPort,
  type PetNotification,
  type PetNotificationKind,
  type PetProvider,
  type PetProviderContext,
  type PetSnapshot,
  type PetTaskCard,
} from "./contract.js";
export {
  builtinPetProvider,
  listPetProviders,
  listPets,
  registerPetProvider,
  resetPetProvidersForTests,
} from "./petRegistry.js";
export {
  invalidatePetCatalog,
  loadPetCatalog,
  usePetCatalog,
  useResolvedPet,
} from "./usePetCatalog.js";
export { derivePetNotificationEvent } from "./usePetNotification.js";
export {
  pickInteractionAnimation,
  useAmbientPetFrame,
  type AmbientPetFrameState,
  type ManualPetAnimation,
} from "./useAmbientPetFrame.js";
