/**
 * Browser client for the local Sunny API. Holds no secrets: the API key lives
 * only in the server process.
 */
import { LIMITS, type AiErrorCode, type ChatRequest, type ChatResponse, type StatusResponse } from '../shared/api';
import type { ConversationState } from './types';

export class AiRequestError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function fetchStatus(verify = false): Promise<StatusResponse> {
  try {
    const res = await fetch(`/api/sunny/status${verify ? '?verify=1' : ''}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as StatusResponse;
  } catch {
    return { aiAvailable: false, model: null, reason: 'The local Sunny API could not be reached.' };
  }
}

/** Build the request: recent history, stated facts, and the snapshot only if permission was granted. */
export function buildChatRequest(state: ConversationState): ChatRequest {
  const granted = state.facts.dataSource === 'snapshot';
  const p = state.profile;
  const f = state.facts;
  return {
    firstName: p.firstName,
    messages: state.messages
      .filter((m) => !m.local && m.text.trim())
      .slice(-LIMITS.maxMessages)
      .map((m) => ({ role: m.role, text: m.text.slice(0, LIMITS.maxMessageChars) })),
    facts: {
      target: f.target,
      homeSavings: f.homeSavings,
      reservedSeparately: f.reservedSeparately,
      monthly: f.monthly,
      timelineMonths: f.timelineMonths,
      homeSavingsHeldElsewhere: f.homeSavingsHeldElsewhere,
    },
    snapshotPermission: f.dataSource === 'snapshot' ? 'granted' : f.dataSource === 'manual' ? 'declined' : 'not_asked',
    snapshot: granted
      ? {
          chequingBalance: p.chequingBalance,
          savingsBalance: p.savingsBalance,
          monthlyIncome: p.monthlyIncome,
          monthlyExpenses: p.monthlyExpenses,
          otherSavingsCommitments: p.otherSavingsCommitments,
        }
      : null,
  };
}

const MESSAGES: Record<AiErrorCode, string> = {
  not_configured: 'Live AI (Gemini) isn’t set up on this computer yet.',
  auth_error: 'Gemini didn’t accept the configured API key.',
  rate_limited: 'Gemini’s free-tier usage limit has been reached. Try again shortly.',
  timeout: 'Gemini took too long to respond.',
  provider_error: 'I couldn’t get a response from Gemini.',
  bad_request: 'That message couldn’t be sent.',
};

export async function requestChat(body: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.timeoutMs + 20_000);
  signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch('/api/sunny/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new AiRequestError('timeout', MESSAGES.timeout);
    throw new AiRequestError('provider_error', 'I couldn’t reach the local Sunny service. Is the app server still running?');
  }
  clearTimeout(timer);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // handled below
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: AiErrorCode; message?: string } } | null)?.error;
    const code = err?.code && err.code in MESSAGES ? err.code : 'provider_error';
    throw new AiRequestError(code, err?.message || MESSAGES[code]);
  }
  const r = json as Partial<ChatResponse> | null;
  if (!r || typeof r.reply !== 'string') throw new AiRequestError('provider_error', MESSAGES.provider_error);
  return {
    reply: r.reply,
    sourceIds: Array.isArray(r.sourceIds) ? r.sourceIds : [],
    suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
    effects: Array.isArray(r.effects) ? r.effects : [],
  };
}
