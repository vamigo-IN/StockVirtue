import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import {
  AiProviderClient,
  AiProviderError,
  CompletionRequest,
  CompletionResult,
  parseJsonAnswer,
  ProviderSettings,
} from './types';

/** Claude models offered in the portal, with list prices (US$ per million tokens) for estimates. */
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', input: 4, output: 20 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', input: 2, output: 10 },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    input: 0.1,
    output: 0.5,
  },
] as const;
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/**
 * Models that support server-side fallback: if a safety classifier declines a
 * request, the API re-runs it on Anthropic's recommended fallback model
 * instead of returning the refusal. Haiku has no fallback.
 */
const FALLBACK_MODELS = new Set([
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
  'claude-fable-5',
]);

/**
 * Claude through the official Anthropic SDK. Answers are constrained to the
 * task's JSON schema with structured outputs (output_config.format); the SDK
 * retries rate limits, overloads and server errors itself.
 */
export class AnthropicProvider implements AiProviderClient {
  private readonly client: Anthropic;

  constructor(private readonly settings: ProviderSettings) {
    if (!settings.apiKey) {
      throw new AiProviderError(
        'Add an Anthropic API key to this provider.',
        'auth',
        false,
      );
    }
    this.client = new Anthropic({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined,
      timeout: settings.timeoutSeconds * 1000,
      maxRetries: 2,
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const params = {
      model: this.settings.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user' as const, content: req.prompt }],
      output_config: {
        format: { type: 'json_schema' as const, schema: req.schema },
      },
    };
    // Server-side fallback is a Claude API feature: only on Anthropic's own
    // endpoint, and only for models that have one.
    const fallback =
      !this.settings.baseUrl && FALLBACK_MODELS.has(this.settings.model);
    let message: Anthropic.Message | Anthropic.Beta.BetaMessage;
    try {
      message = fallback
        ? await this.client.beta.messages.create({
            ...params,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          })
        : await this.client.messages.create(params);
    } catch (err) {
      throw toProviderError(err);
    }

    // A refusal can arrive with no content at all: check before reading it.
    if (message.stop_reason === 'refusal') {
      throw new AiProviderError(
        'The AI declined this request.',
        'refusal',
        false,
      );
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiProviderError(
        'The AI’s answer was cut off before it finished.',
        'truncated',
        false,
      );
    }
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return {
      data: parseJsonAnswer(text),
      inputTokens: message.usage.input_tokens ?? null,
      outputTokens: message.usage.output_tokens ?? null,
      model: message.model,
    };
  }
}

/** Most specific first: APIConnectionError is itself an APIError subclass. */
function toProviderError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  if (err instanceof AuthenticationError) {
    return new AiProviderError(
      'Anthropic rejected the API key.',
      'auth',
      false,
    );
  }
  if (err instanceof PermissionDeniedError) {
    return new AiProviderError(
      'This Anthropic key isn’t allowed to use that model.',
      'permission',
      false,
    );
  }
  if (err instanceof NotFoundError) {
    return new AiProviderError(
      'Anthropic doesn’t know this model, or it isn’t available to your organisation.',
      'model',
      false,
    );
  }
  if (err instanceof RateLimitError) {
    return new AiProviderError(
      'Anthropic is rate-limiting requests. Try again in a minute.',
      'rate_limit',
      true,
    );
  }
  if (err instanceof BadRequestError) {
    return new AiProviderError(
      `Anthropic refused the request: ${err.message.slice(0, 200)}`,
      'bad_request',
      false,
    );
  }
  if (err instanceof APIConnectionTimeoutError) {
    return new AiProviderError(
      'Anthropic took too long to answer.',
      'timeout',
      true,
    );
  }
  if (err instanceof APIConnectionError) {
    return new AiProviderError('Couldn’t reach Anthropic.', 'network', true);
  }
  if (err instanceof InternalServerError) {
    return new AiProviderError(
      'Anthropic is overloaded or had a problem. Try again shortly.',
      err.status === 529 ? 'overloaded' : 'provider',
      true,
    );
  }
  if (err instanceof APIError) {
    return new AiProviderError(
      `Anthropic returned an error${err.status ? ` (${err.status})` : ''}.`,
      'provider',
      (err.status ?? 0) >= 500,
    );
  }
  return new AiProviderError(
    'The request to Anthropic failed.',
    'provider',
    false,
  );
}
