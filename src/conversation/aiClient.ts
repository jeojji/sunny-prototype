/**
 * Browser client for the local Sunny API. Holds no secrets: the API key lives
 * only in the server process.
 */
import { LIMITS, type AiErrorCode, type ChatRequest, type ChatResponse, type StatusResponse } from '../shared/api';
import { currentBalances, signalFor } from './engine';
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
    return { aiAvailable: false, model: null, reason: 'No Sunny server is available here (for example, on the static GitHub Pages demo), so live AI is off and this is the scripted demo.' };
  }
}

/**
 * Build the request: recent history and customer-confirmed context; account
 * details (balances, cash flow, signal evidence) only if permission was granted.
 */
export function buildChatRequest(state: ConversationState): ChatRequest {
  const m = state.memory;
  const granted = m.permission === 'granted';
  const b = currentBalances(state);
  const signal = signalFor(state);
  return {
    firstName: state.profile.firstName,
    messages: state.messages
      // Messages containing account details are only sent while permission is granted (e.g. after a revoke, they stay out).
      .filter((msg) => !msg.local && msg.text.trim() && (granted || !msg.accountDetail))
      .slice(-LIMITS.maxMessages)
      .map((msg) => ({ role: msg.role, text: msg.text.slice(0, LIMITS.maxMessageChars) })),
    permission: m.permission,
    account: granted
      ? {
          chequingBalance: b.chequing,
          savingsBalance: b.savings,
          monthlyIncome: state.profile.monthlyIncome,
          monthlyExpenses: state.profile.monthlyExpenses,
          signal:
            state.origin === 'nudge' || m.prompt === 'nudge'
              ? {
                  rule: 'elevated_chequing_balance',
                  shown: true,
                  observationDays: state.signalConfig.observationDays,
                  threshold: state.signalConfig.threshold,
                  minBalance: signal.evidence.minBalance,
                  maxBalance: signal.evidence.maxBalance,
                }
              : null,
        }
      : null,
    context: {
      origin: state.origin,
      allocations: m.allocations.map((a) => ({ account: a.account, purpose: a.purpose, amount: a.amount })),
      goal: m.goal,
      horizon: m.horizon,
      nextStep: m.nextStep,
      offeringsShown: m.offeringsShown,
      offeringsExplored: m.offeringsExplored,
      previousNextStep: state.origin === 'checkin' ? m.nextStep : null,
    },
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
