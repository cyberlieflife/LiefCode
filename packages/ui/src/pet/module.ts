/**
 * pet 模块清单（architecture-governance managed 模块）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const petModule = {
  id: "pet",
  requires: ["shared", "ui"],
  provides: ["pet"],
  publicEntrypoints: ["index.ts", "desktopEntry.ts", "storeSlice.ts"],
} as const;
