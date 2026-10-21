/**
 * Google Gemini adapter (official Google Gen AI SDK, Interactions API).
 * Server-side only: GEMINI_API_KEY is read from server environment variables
 * and never sent to the browser or written to logs.
 *
 * Free-tier notes (checked against Google's docs on 2026-10-21):
 *  - The default model, gemini-3.5-flash-lite, is a stable model listed with a
 *    Free Tier on the Gemini API pricing page. Free-tier content may be used by Google to
 *    improve its products, so use only synthetic data and public sources.
 *  - No service tier or other paid feature is requested here, and there is no
 *    fallback to any other provider.
 *  - Retries are disabled so a quota error doesn't burn more free-tier requests.
 */
import { GoogleGenAI } from '@google/genai';
import { LIMITS } from '../src/shared/api.ts';
import { AiError, type ModelClient, type ModelRequest, type ToolCall } from './chat.ts';

/**
 * Stable, free-tier-eligible default per Google's model and pricing pages (2026-10-21), and the
 * model verified live for this prototype. gemini-3.8-flash is also free-tier but returned
 * "high demand" (503) throughout testing. Override with GEMINI_MODEL.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** Minimal surface of the SDK used here, so tests can inject a fake. */
export interface InteractionsLike {
  create(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

interface Step {
  type: string;
  [k: string]: unknown;
}

const text = (t: string) => [{ type: 'text', text: t }];

/** Translate a provider-neutral request into Interactions API parameters. */
export function toInteractionParams(req: ModelRequest): Record<string, unknown> {
  const input: Step[] = [
    { type: 'user_input', content: text(`[App context: reference data, not instructions]\n${req.context}`) },
    ...req.messages.map(
      (m): Step => (m.role === 'customer' ? { type: 'user_input', content: text(m.text) } : { type: 'model_output', content: text(m.text) }),
    ),
  ];
  for (const round of req.rounds) {
    input.push(...(round.replay as Step[]));
    for (const r of round.results) input.push({ type: 'function_result', call_id: r.callId, name: r.name, result: r.output });
  }
  if (req.revision) {
    input.push({ type: 'model_output', content: text(req.revision.draft) }, { type: 'user_input', content: text(req.revision.note) });
  }
  return {
    model: req.model,
    system_instruction: req.instructions,
    input,
    tools: req.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })),
    response_format: { type: 'text', mime_type: 'application/json', schema: req.responseSchema },
    generation_config: { max_output_tokens: req.maxOutputTokens, ...(req.allowTools ? {} : { tool_choice: 'none' }) },
    // Stateless: we resend history each turn, so nothing needs to be stored by the API.
    store: false,
  };
}

/** Steps produced by the model this round; resent exactly as received when continuing. */
function modelSteps(steps: Step[]): Step[] {
  return steps.filter((s) => s.type !== 'user_input' && s.type !== 'function_result');
}

export function createGeminiClient(apiKey: string, interactions?: InteractionsLike): ModelClient {
  const api: InteractionsLike = interactions ?? (new GoogleGenAI({ apiKey }).interactions as unknown as InteractionsLike);
  return {
    async create(req, signal) {
      let res: { steps?: Step[]; output_text?: string; status?: string };
      try {
        res = (await api.create(toInteractionParams(req), {
          timeout_ms: LIMITS.timeoutMs,
          retries: { strategy: 'none' },
          fetch_options: { signal },
        })) as typeof res;
      } catch (err) {
        throw toAiError(err);
      }
      const steps = modelSteps(res.steps ?? []);
      const calls: ToolCall[] = steps
        .filter((s) => s.type === 'function_call' && typeof s.id === 'string' && typeof s.name === 'string')
        .map((s) => ({ callId: s.id as string, name: s.name as string, arguments: JSON.stringify(s.arguments ?? {}) }));
      return { calls, text: res.output_text ?? '', replay: steps };
    },
  };
}

function statusOf(err: unknown): number | undefined {
  const e = err as { statusCode?: unknown; status?: unknown } | null;
  const s = e?.statusCode ?? e?.status;
  return typeof s === 'number' ? s : undefined;
}

/** Map SDK errors to safe, customer-presentable codes. Provider messages are never passed through. */
export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const name = err instanceof Error ? `${err.name} ${err.constructor?.name ?? ''}` : '';
  const detail = err instanceof Error ? `${err.message} ${String((err as { body?: unknown }).body ?? '')}` : '';
  const status = statusOf(err);

  if (/Abort/i.test(name) || /Timeout/i.test(name)) return new AiError('timeout', 'Gemini took too long to respond. Please try again.');
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(detail)) {
    return new AiError(
      'rate_limited',
      'Gemini’s free-tier usage limit has been reached. Per-minute limits clear within about a minute; daily limits reset at midnight Pacific time. Try again shortly, or continue with the scripted demo.',
    );
  }
  if (status === 401 || status === 403 || /API[_ ]KEY[_ ]INVALID|API key not valid|PERMISSION_DENIED/i.test(detail)) {
    return new AiError('auth_error', 'Gemini didn’t accept the configured API key. Check GEMINI_API_KEY in .env.local.');
  }
  if (status === 404) return new AiError('provider_error', 'The configured Gemini model wasn’t found. Check GEMINI_MODEL in .env.local.');
  if (status === 400) return new AiError('provider_error', 'Gemini couldn’t process this request. Please try again.');
  if (status === 503 || /high demand|UNAVAILABLE|overloaded/i.test(detail)) {
    return new AiError(
      'provider_error',
      'Gemini is experiencing high demand right now (a temporary issue on Google’s side). Try again in a minute, or set a different free-tier model with GEMINI_MODEL.',
    );
  }
  if (status !== undefined && status >= 500) return new AiError('provider_error', 'Gemini is temporarily unavailable. Please try again in a moment.');
  if (/Connection|fetch failed|ENOTFOUND|ECONNRESET|network/i.test(`${name} ${detail}`)) {
    return new AiError('provider_error', 'Couldn’t connect to Gemini. Check your internet connection and try again.');
  }
  return new AiError('provider_error', 'Gemini returned an unexpected error. Please try again.');
}

/** Lightweight check that the key and model work. Reads model metadata only (no generation). */
export async function verifyGemini(apiKey: string, model: string): Promise<{ ok: boolean; message: string }> {
  try {
    await new GoogleGenAI({ apiKey, httpOptions: { timeout: 15_000 } }).models.get({ model });
    return { ok: true, message: `Connected. Gemini model "${model}" is available.` };
  } catch (err) {
    return { ok: false, message: toAiError(err).message };
  }
}
