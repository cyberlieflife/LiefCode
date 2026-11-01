import type { SourceKind } from "./kind.js";
import { githubSource } from "./github.js";
import { feishuSource } from "./feishu.js";

export * from "./kind.js";
export * from "./github.js";
export * from "./feishu.js";
export * from "./node-runner.js";

export class SourceRegistry {
  private readonly kinds = new Map<string, SourceKind<unknown>>();

  constructor(kinds: SourceKind<unknown>[] = [githubSource as SourceKind<unknown>, feishuSource as SourceKind<unknown>]) {
    for (const kind of kinds) this.kinds.set(kind.kind, kind);
  }

  get(kind: string): SourceKind<unknown> | undefined {
    return this.kinds.get(kind);
  }

  list(): SourceKind<unknown>[] {
    return [...this.kinds.values()];
  }
}

export const defaultSourceRegistry = new SourceRegistry();
