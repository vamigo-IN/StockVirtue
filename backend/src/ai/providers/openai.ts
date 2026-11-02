import { AiProviderKind } from '@prisma/client';
import { postJson, trimBase } from './http';
import {
  AiProviderClient,
  AiProviderError,
  CompletionRequest,
  CompletionResult,
  parseJsonAnswer,
  ProviderSettings,
} from './types';

interface ChatCompletion {
  model?: string;
  choices?: {
    finish_reason?: string;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * OpenAI and OpenAI-compatible servers (OpenRouter, Together, Groq, vLLM,
 * LM Studio, Ollama's /v1 …) over the Chat Completions API. OpenAI itself
 * enforces the task's JSON schema strictly; compatible servers get JSON mode
 * with the schema spelled out in the prompt, and the answer is validated
 * afterwards either way.
 */
export class OpenAiProvider implements AiProviderClient {
  private readonly strict: boolean;
  private readonly endpoint: string;

  constructor(private readonly settings: ProviderSettings) {
    this.strict = settings.kind === AiProviderKind.OPENAI;
    if (!settings.baseUrl && !this.strict) {
      throw new AiProviderError(
        'Give this provider its API address.',
        'bad_request',
        false,
      );
    }
    if (this.strict && !settings.apiKey) {
      throw new AiProviderError(
        'Add an OpenAI API key to this provider.',
        'auth',
        false,
      );
    }
    const base = trimBase(settings.baseUrl || 'https://api.openai.com/v1');
    this.endpoint = base.endsWith('/chat/completions')
      ? base
      : `${base}/chat/completions`;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const prompt = this.strict
      ? req.prompt
      : `${req.prompt}\n\nReply with a single JSON object that matches this JSON Schema:\n${JSON.stringify(req.schema)}`;
    const body = {
      model: this.settings.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: prompt },
      ],
      ...(this.strict
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: req.schemaName,
                schema: req.schema,
                strict: true,
              },
            },
            max_completion_tokens: req.maxTokens,
          }
        : {
            response_format: { type: 'json_object' },
            max_tokens: req.maxTokens,
          }),
    };
    const res = (await postJson(
      this.endpoint,
      body,
      this.settings.apiKey
        ? { authorization: `Bearer ${this.settings.apiKey}` }
        : {},
      this.settings.timeoutSeconds * 1000,
    )) as ChatCompletion;

    const choice = res.choices?.[0];
    if (
      choice?.message?.refusal ||
      choice?.finish_reason === 'content_filter'
    ) {
      throw new AiProviderError(
        'The AI declined this request.',
        'refusal',
        false,
      );
    }
    if (choice?.finish_reason === 'length') {
      throw new AiProviderError(
        'The AI’s answer was cut off before it finished.',
        'truncated',
        false,
      );
    }
    const content = choice?.message?.content;
    if (!content) {
      throw new AiProviderError(
        'The provider sent an empty answer.',
        'bad_output',
        true,
      );
    }
    return {
      data: parseJsonAnswer(content),
      inputTokens: res.usage?.prompt_tokens ?? null,
      outputTokens: res.usage?.completion_tokens ?? null,
      model: res.model || this.settings.model,
    };
  }
}
