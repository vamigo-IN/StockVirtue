import { AiProviderKind } from '@prisma/client';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { OpenAiProvider } from './openai';
import { AiProviderClient, ProviderSettings } from './types';

export { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from './anthropic';
export * from './types';

/** The adapter for a provider kind. Adding a provider means adding a case here. */
export function providerClient(settings: ProviderSettings): AiProviderClient {
  switch (settings.kind) {
    case AiProviderKind.ANTHROPIC:
      return new AnthropicProvider(settings);
    case AiProviderKind.OPENAI:
    case AiProviderKind.OPENAI_COMPATIBLE:
      return new OpenAiProvider(settings);
    case AiProviderKind.OLLAMA:
      return new OllamaProvider(settings);
  }
}

/** Estimated cost in US dollars, when the provider's prices are known. */
export function estimateCost(
  rates: { inputCostPerMTok: number | null; outputCostPerMTok: number | null },
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (rates.inputCostPerMTok == null && rates.outputCostPerMTok == null) {
    return null;
  }
  const cost =
    ((inputTokens ?? 0) * (rates.inputCostPerMTok ?? 0) +
      (outputTokens ?? 0) * (rates.outputCostPerMTok ?? 0)) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}
