/**
 * One customer turn: retrieve knowledge, call the model with validated tools,
 * then validate the structured reply. Provider-agnostic via ModelClient.
 */
import { LIMITS, type AiErrorCode, type ChatRequest, type ChatResponse } from '../src/shared/api.ts';
import { findAmounts } from '../src/lib/parse.ts';
import { KNOWLEDGE, retrieve, validateSourceIds } from '../src/shared/knowledge.ts';
import { SYSTEM_INSTRUCTIONS, turnContext } from './prompt.ts';
import { executeTool, TOOL_DEFINITIONS, type ToolContext } from './tools.ts';

/** A tool call requested by the model; `arguments` is a JSON string. */
export interface ToolCall {
  callId: string;
  name: string;
  arguments: string;
}

/** One completed tool round within a turn: the model's own items (opaque) plus our results. */
export interface ToolRound {
  /** Provider-specific items to resend exactly as received (e.g. thoughts, function calls). */
  replay: unknown[];
  results: { callId: string; name: string; output: string }[];
}

/** Provider-neutral request. Adapters (e.g. geminiClient.ts) translate it to their SDK. */
export interface ModelRequest {
  model: string;
  /** System rules. */
  instructions: string;
  /** Per-turn reference data (facts, permission, knowledge). Not instructions. */
  context: string;
  messages: { role: 'customer' | 'sunny'; text: string }[];
  tools: typeof TOOL_DEFINITIONS;
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
  rounds: ToolRound[];
  /** False forces a text answer (no further tool calls) this round. */
  allowTools: boolean;
  /** Present when the app asks the model to revise a draft reply that failed a check. */
  revision?: { draft: string; note: string };
}

export interface ModelResult {
  calls: ToolCall[];
  /** Final text (JSON per responseSchema) when there are no calls. */
  text: string;
  replay: unknown[];
}

export interface ModelClient {
  create(req: ModelRequest, signal: AbortSignal): Promise<ModelResult>;
}

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** JSON schema for Sunny's final reply. Output is re-validated after parsing. */
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    source_ids: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['reply', 'source_ids', 'suggestions'],
};

/** Validate and trim an incoming request body. Throws AiError('bad_request'). */
export function sanitizeRequest(body: unknown): ChatRequest {
  const b = body as Partial<ChatRequest> | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.messages) || !b.facts) {
    throw new AiError('bad_request', 'Malformed request.');
  }
  const messages = b.messages
    .filter((m) => m && (m.role === 'customer' || m.role === 'sunny') && typeof m.text === 'string' && m.text.trim())
    .slice(-LIMITS.maxMessages)
    .map((m) => ({ role: m.role, text: m.text.slice(0, LIMITS.maxMessageChars) }));
  const last = messages.at(-1);
  if (!last || last.role !== 'customer') throw new AiError('bad_request', 'The last message must be from the customer.');
  const lastRaw = b.messages.at(-1)?.text ?? '';
  if (lastRaw.length > LIMITS.maxCustomerChars) {
    throw new AiError('bad_request', `Messages are limited to ${LIMITS.maxCustomerChars} characters.`);
  }
  const permission = b.snapshotPermission === 'granted' || b.snapshotPermission === 'declined' ? b.snapshotPermission : 'not_asked';
  const s = b.snapshot;
  const snapshot =
    permission === 'granted' && s && typeof s === 'object'
      ? {
          chequingBalance: Number(s.chequingBalance) || 0,
          savingsBalance: Number(s.savingsBalance) || 0,
          monthlyIncome: Number(s.monthlyIncome) || 0,
          monthlyExpenses: Number(s.monthlyExpenses) || 0,
          otherSavingsCommitments: Number(s.otherSavingsCommitments) || 0,
        }
      : null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const f = b.facts;
  return {
    firstName: String(b.firstName ?? 'there').slice(0, 40),
    messages,
    snapshotPermission: permission,
    snapshot,
    facts: {
      target: num(f.target),
      homeSavings: num(f.homeSavings),
      reservedSeparately: num(f.reservedSeparately),
      monthly: num(f.monthly),
      timelineMonths: num(f.timelineMonths),
      homeSavingsHeldElsewhere: f.homeSavingsHeldElsewhere === true,
    },
  };
}

/** Knowledge retrieval uses the latest two customer messages plus the previous Sunny reply. */
export function retrievalQuery(req: ChatRequest): string {
  const customer = req.messages.filter((m) => m.role === 'customer').slice(-2).map((m) => m.text);
  const sunny = req.messages.filter((m) => m.role === 'sunny').slice(-1).map((m) => m.text.slice(0, 400));
  return [...customer, ...sunny].join(' ');
}

function parseReply(text: string): { reply: string; source_ids: unknown; suggestions: unknown } {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) return parsed;
  } catch {
    // fall through
  }
  throw new AiError('provider_error', 'The AI response could not be read.');
}

const DOLLAR_RE = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/gi;

function dollarFigures(text: string): number[] {
  return [...text.matchAll(DOLLAR_RE)].map((m) => {
    const n = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
    return Math.round(n * 100) / 100;
  });
}

/** Every number appearing in the given sources (customer text, facts, tool results, knowledge…). */
function numbersIn(...sources: string[]): Set<number> {
  const out = new Set<number>();
  for (const src of sources) {
    for (const m of src.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(Math.round(parseFloat(m[0].replace(/,/g, '')) * 100) / 100);
    for (const a of findAmounts(src)) out.add(a.value);
  }
  return out;
}

/**
 * Dollar figures in a reply that no trusted source supports. The model must not
 * do arithmetic; figures must come from the customer, stated facts, the snapshot,
 * knowledge entries or deterministic tool results.
 */
export function unsupportedFigures(reply: string, allowed: Set<number>): number[] {
  return dollarFigures(reply).filter((n) => !allowed.has(n));
}

/** Opt-in diagnostics (SUNNY_DEBUG_TOOLS=1): tool names and statuses only, never content or keys. */
function debugLog(round: number, entries: string[]) {
  if (typeof process !== 'undefined' && process.env?.SUNNY_DEBUG_TOOLS === '1') console.info(`[sunny] round ${round + 1}: ${entries.join(', ')}`);
}

/** Enforce the turn deadline even if the SDK doesn't honour the abort signal. */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AiError('timeout', 'The AI service took too long to respond.'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

export async function runChatTurn(
  req: ChatRequest,
  client: ModelClient,
  model: string,
  signal: AbortSignal,
): Promise<ChatResponse> {
  const entries = retrieve(retrievalQuery(req), 7);
  const ctx: ToolContext = {
    req,
    facts: { ...req.facts },
    latestCustomer: req.messages.at(-1)!.text,
    effects: [],
  };
  const context = turnContext(req, entries);
  const rounds: ToolRound[] = [];
  let allowTools = true;
  let revision: ModelRequest['revision'];
  const trusted = () =>
    numbersIn(
      context,
      ...KNOWLEDGE.map((e) => e.content),
      JSON.stringify(req.facts),
      JSON.stringify(ctx.facts),
      JSON.stringify(req.snapshot ?? {}),
      ...req.messages.map((m) => m.text),
      ...rounds.flatMap((r) => r.results.map((x) => x.output)),
    );

  for (let round = 0; round < LIMITS.maxToolRounds; round++) {
    if (signal.aborted) throw new AiError('timeout', 'The AI service took too long to respond.');
    const res = await withAbort(client.create(
      {
        model,
        instructions: SYSTEM_INSTRUCTIONS,
        context,
        messages: req.messages,
        tools: TOOL_DEFINITIONS,
        responseSchema: REPLY_SCHEMA,
        maxOutputTokens: LIMITS.maxOutputTokens,
        rounds,
        allowTools: allowTools && round < LIMITS.maxToolRounds - 1,
        ...(revision ? { revision } : {}),
      },
      signal,
    ), signal);
    if (!res.calls.length) {
      const parsed = parseReply(res.text);
      const bad = unsupportedFigures(parsed.reply, trusted());
      if (bad.length && !revision && round < LIMITS.maxToolRounds - 1) {
        debugLog(round, [`revision: unsupported figures ${bad.length}`]);
        revision = {
          draft: parsed.reply,
          note:
            `[App check] Your draft states dollar figures that no tool or stated fact produced (${bad.map((n) => `$${n.toLocaleString('en-CA')}`).join(', ')}). ` +
            'Never do arithmetic yourself. Write a complete, helpful replacement reply (do not apologise or mention this check): record facts the customer stated with propose_fact_update and use calculate_scenario for any totals, or explain what is still needed.',
        };
        continue;
      }
      return {
        reply: parsed.reply.trim().slice(0, LIMITS.maxReplyChars),
        sourceIds: validateSourceIds(parsed.source_ids),
        suggestions: (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim().slice(0, 80))
          .slice(0, LIMITS.maxSuggestions),
        effects: ctx.effects,
      };
    }
    const results = res.calls.map((c) => ({ callId: c.callId, name: c.name, output: executeTool(c.name, c.arguments, ctx) }));
    rounds.push({ replay: res.replay, results });
    const statuses = results.map((r) => (JSON.parse(r.output) as { status?: string }).status ?? 'unknown');
    debugLog(round, results.map((r, i) => `${r.name}:${statuses[i]}`));
    // If nothing useful happened, stop offering tools so the model answers (and doesn't burn quota).
    if (statuses.every((st) => st === 'not_needed' || st === 'already_granted' || st === 'customer_declined')) allowTools = false;
  }
  throw new AiError('provider_error', 'The AI took too many steps to answer.');
}
