import { postJson, trimBase } from './http';
import {
  AiProviderClient,
  AiProviderError,
  CompletionRequest,
  CompletionResult,
  parseJsonAnswer,
  ProviderSettings,
} from './types';

interface OllamaChat {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * A self-hosted Ollama server through its native chat API, with the task's
 * JSON schema as the structured-output format. No key is needed unless the
 * server sits behind a proxy that asks for one.
 */
export class OllamaProvider implements AiProviderClient {
  private readonly endpoint: string;

  constructor(private readonly settings: ProviderSettings) {
    if (!settings.baseUrl) {
      throw new AiProviderError(
        'Give the Ollama server’s address, e.g. http://localhost:11434.',
        'bad_request',
        false,
      );
    }
    this.endpoint = `${trimBase(settings.baseUrl)}/api/chat`;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = (await postJson(
      this.endpoint,
      {
        model: this.settings.model,
        stream: false,
        format: req.schema,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
        options: { num_predict: req.maxTokens },
      },
      this.settings.apiKey
        ? { authorization: `Bearer ${this.settings.apiKey}` }
        : {},
      this.settings.timeoutSeconds * 1000,
    )) as OllamaChat;
    if (res.done_reason === 'length') {
      throw new AiProviderError(
        'The AI’s answer was cut off before it finished.',
        'truncated',
        false,
      );
    }
    const content = res.message?.content;
    if (!content) {
      throw new AiProviderError(
        'Ollama sent an empty answer.',
        'bad_output',
        true,
      );
    }
    return {
      data: parseJsonAnswer(content),
      inputTokens: res.prompt_eval_count ?? null,
      outputTokens: res.eval_count ?? null,
      model: res.model || this.settings.model,
    };
  }
}
