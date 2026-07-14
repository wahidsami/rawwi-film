import { createOpenAIProvider, type OpenAIProviderOptions } from "./openaiProvider.js";
import type { V3Provider, V3ProviderName } from "./providerTypes.js";

export type V3ProviderFactoryConfig = Readonly<{
  openAI?: OpenAIProviderOptions;
}>;

export type V3ProviderFactory = Readonly<{
  create: (providerName?: V3ProviderName) => V3Provider;
}>;

function createUnsupportedProvider(providerName: V3ProviderName): V3Provider {
  return {
    name: providerName,
    async callJudgeRaw(): Promise<never> {
      throw new Error(`V3 provider "${providerName}" is not implemented yet.`);
    },
  };
}

export function createV3ProviderFactory(config?: V3ProviderFactoryConfig): V3ProviderFactory {
  return {
    create(providerName: V3ProviderName = "openai"): V3Provider {
      switch (providerName) {
        case "openai":
          return createOpenAIProvider(config?.openAI);
        case "gemini":
        case "local":
          return createUnsupportedProvider(providerName);
        default:
          return createUnsupportedProvider(providerName as never);
      }
    },
  };
}

export function createV3Provider(providerName?: V3ProviderName, config?: V3ProviderFactoryConfig): V3Provider {
  return createV3ProviderFactory(config).create(providerName);
}
