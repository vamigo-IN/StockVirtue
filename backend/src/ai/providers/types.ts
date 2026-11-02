import type { AiProviderKind } from '@prisma/client';

/** A JSON Schema the provider must answer in (all objects closed, all fields required). */
export type JsonSchema = Record<string, unknown>;

/** One structured request: instructions, the task, and the answer's shape. */
export interface CompletionRequest {
  system: string;
  prompt: string;
  schema: JsonSchema;
  /** Short identifier for the schema (OpenAI requires one). */
  schemaName: string;
  maxTokens: number;
}

export interface CompletionResult {
  /** The parsed JSON answer, not yet validated against the task. */
  data: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  /** The model that actually answered (may differ after a server-side fallback). */
  model: string;
}

/** What the newsroom stores about a provider, with its key already opened. */
export interface ProviderSettings {
  kind: AiProviderKind;
  baseUrl: string | null;
  model: string;
  apiKey: string | null;
  timeoutSeconds: number;
}

export type ProviderErrorCode =
  | 'auth'
  | 'permission'
  | 'model'
  | 'bad_request'
  | 'rate_limit'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'refusal'
  | 'truncated'
  | 'bad_output'
  | 'provider';

/** A provider call that failed. `message` is written for newsroom staff. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface AiProviderClient {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** Strips a code fence some servers wrap JSON in, then parses it. */
export function parseJsonAnswer(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new AiProviderError(
      'The AI’s answer wasn’t in the expected format. Try again.',
      'bad_output',
      true,
    );
  }
}

/** HTTP status → error, for the providers called over plain HTTP. */
export function httpError(status: number, detail: string): AiProviderError {
  const why = detail ? ` (${detail.slice(0, 200)})` : '';
  if (status === 401) {
    return new AiProviderError(
      'The provider rejected the API key.',
      'auth',
      false,
    );
  }
  if (status === 403) {
    return new AiProviderError(
      `The API key isn’t allowed to do this${why}.`,
      'permission',
      false,
    );
  }
  if (status === 404) {
    return new AiProviderError(
      `The provider doesn’t know this model, or the address is wrong${why}.`,
      'model',
      false,
    );
  }
  if (status === 429) {
    return new AiProviderError(
      'The provider is rate-limiting requests. Try again in a minute.',
      'rate_limit',
      true,
    );
  }
  if (status >= 500) {
    return new AiProviderError(
      `The provider had a problem answering${why}.`,
      status === 529 || status === 503 ? 'overloaded' : 'provider',
      true,
    );
  }
  return new AiProviderError(
    `The provider refused the request${why}.`,
    'bad_request',
    false,
  );
}
