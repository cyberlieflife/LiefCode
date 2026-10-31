import { describe, expect, it } from "vitest";
import type { ProviderSettingsFormProvider } from "@/lib/providerSettingsFormTypes.js";
import {
  buildProviderNavigationCopyConfig,
  resolveProviderNavigationCopyId,
} from "@/settings/model-provider-section/Navigation.js";

function createProvider(): ProviderSettingsFormProvider {
  return {
    providerId: "provider-demo",
    providerName: "Demo Provider",
    executable: true,
    enabled: true,
    hasPersonalConfig: true,
    personalConfig: {
      group: "standard-personal",
      access: { type: "api-key", apiKey: "sk-old" },
      api: { type: "anthropic-messages", baseUrl: "https://old.example.com/v1" },
      personalModelIds: ["demo-model"],
      enabled: true,
    },
    config: {
      group: "standard-personal",
      access: { type: "api-key", apiKey: "sk-old" },
      api: {
        type: "anthropic-messages",
        baseUrl: "https://old.example.com/v1",
        headers: { "x-old": "remove-on-edit" },
      },
      personalModelIds: ["demo-model"],
      enabled: true,
    },
    models: [
      {
        kind: "candidate",
        modelId: "demo-model",
        builtin: false,
        personalConfig: {},
        config: {},
        hasPersonalConfig: true,
        executable: true,
        selectable: true,
      },
    ],
  };
}

describe("provider navigation copy", () => {
  it("复制自定义供应商配置时保留标识和地址，但不包含密钥或认证头", () => {
    const item = {
      key: "custom:provider-demo",
      type: "custom" as const,
      label: "Demo Provider",
      provider: createProvider(),
      statusActive: true,
    };

    expect(resolveProviderNavigationCopyId(item)).toBe("provider-demo");
    const config = buildProviderNavigationCopyConfig(item);
    expect(config).toContain("provider-demo");
    expect(config).toContain("https://old.example.com/v1");
    expect(config).toContain("demo-model");
    expect(config).not.toContain("sk-old");
    expect(config).not.toContain("x-old");
  });

  it("预设供应商没有可复制的个人配置", () => {
    const item = {
      key: "preset:demo",
      type: "preset" as const,
      presetId: "zai-individual-coding-plan",
      label: "Z.ai",
      provider: null,
      displayName: "Z.ai",
      statusActive: true,
    };

    expect(buildProviderNavigationCopyConfig(item)).toBeNull();
  });
});
