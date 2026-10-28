// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EMPTY_CONTEXT, type AccountContext, type ChatRequest, type ChatResponse, type StatusResponse } from '../src/shared/api';
import { AiError, type ModelClient, type ModelRequest, type ModelResult } from './chat';
import { handleChat, handleStatus, type ServerConfig } from './http';

const ACCOUNT: AccountContext = {
  chequingBalance: 28_000,
  savingsBalance: 12_000,
  monthlyIncome: 5_200,
  monthlyExpenses: 3_600,
  signal: { rule: 'elevated_chequing_balance', shown: true, observationDays: 90, threshold: 25_000, minBalance: 25_412, maxBalance: 28_000 },
};

function request(text: string, extra: Partial<ChatRequest> = {}): ChatRequest {
  return {
    firstName: 'Alex',
    messages: [
      { role: 'sunny', text: 'Before we explore anything, is this money set aside for upcoming expenses, emergencies, or something else?' },
      { role: 'customer', text },
    ],
    permission: 'not_asked',
    account: null,
    context: { ...EMPTY_CONTEXT, origin: 'nudge' },
    ...extra,
  };
}
const granted = { permission: 'granted' as const, account: ACCOUNT };

const call = (name: string, args: unknown, id = name) => ({ callId: id, name, arguments: JSON.stringify(args) });
const final = (reply: string, source_ids: string[] = [], suggestions: string[] = []): ModelResult => ({ calls: [], replay: [], text: JSON.stringify({ reply, source_ids, suggestions }) });
const tools = (...calls: ReturnType<typeof call>[]): ModelResult => ({ calls, replay: calls, text: '' });

function mockClient(...results: (ModelResult | Error | 'hang')[]) {
  const requests: ModelRequest[] = [];
  const client: ModelClient = {
    async create(req, signal) {
      requests.push(structuredClone(req));
      const next = results.shift();
      if (next === 'hang') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      if (next instanceof Error) throw next;
      if (!next) throw new Error('no more mock results');
      return next;
    },
  };
  return { client, requests };
}

function config(client: ModelClient | null, extra: Partial<ServerConfig> = {}): ServerConfig {
  return { apiKey: client ? 'test-key' : undefined, model: 'test-model', createClient: () => client!, verify: async () => ({ ok: true, message: 'ok' }), ...extra };
}

async function chat(cfg: ServerConfig, req: ChatRequest) {
  const r = await handleChat(cfg, JSON.stringify(req));
  return { status: r.status, body: r.body as ChatResponse & { error?: { code: string; message: string } } };
}

const toolOutputs = (requests: ModelRequest[], round = 1) => (requests[round]?.rounds ?? []).flatMap((r) => r.results.map((x) => JSON.parse(x.output)));

describe('configuration and failures', () => {
  it('reports a missing key clearly', async () => {
    const body = (await handleStatus(config(null), false)).body as StatusResponse;
    expect(body.aiAvailable).toBe(false);
    expect(body.reason).toMatch(/GEMINI_API_KEY/);
    const c = await chat(config(null), request('Hi'));
    expect(c.status).toBe(503);
    expect(c.body.error?.code).toBe('not_configured');
  });

  it('maps provider errors and timeouts to safe codes', async () => {
    expect((await chat(config(mockClient(new AiError('rate_limited', 'busy')).client), request('Hi'))).status).toBe(429);
    const unknown = await chat(config(mockClient(new Error('boom key=test-key')).client), request('Hi'));
    expect(unknown.status).toBe(502);
    expect(JSON.stringify(unknown.body)).not.toContain('test-key');
    const deaf: ModelClient = { create: () => new Promise(() => {}) };
    expect((await chat(config(deaf, { turnTimeoutMs: 50 }), request('Hi'))).status).toBe(504);
  });

  it('rejects malformed or oversized requests and unreadable model output', async () => {
    expect((await handleChat(config(mockClient().client), 'not json')).status).toBe(400);
    expect((await chat(config(mockClient().client), request('a'.repeat(1001)))).status).toBe(400);
    expect((await chat(config(mockClient({ calls: [], replay: [], text: 'nope' }).client), request('Hi'))).status).toBe(502);
  });
});

describe('privacy and grounding', () => {
  it('without permission, no balances or signal evidence reach the model', async () => {
    const { client, requests } = mockClient(tools(call('read_account_snapshot', {})), final('Happy to help generally.'));
    // Even if a client sends account data without permission, the server drops it.
    await chat(config(client), request('What is this about?', { account: ACCOUNT }));
    const sent = JSON.stringify(requests);
    expect(sent).not.toMatch(/28,000|28000|25,412/);
    expect(toolOutputs(requests)[0].status).toBe('permission_required');
    expect(requests[0].context).toMatch(/ACCOUNT CONTEXT: not shared/);
  });

  it('with permission, the computed signal and balances are provided as reference data', async () => {
    const { client, requests } = mockClient(final('Your balance stayed above $25,000 for 90 days.'));
    const r = await chat(config(client), request('Why am I seeing this?', granted));
    expect(r.status).toBe(200);
    expect(requests[0].context).toMatch(/stayed at or above \$25,000 for the last 90 days/);
    expect(requests[0].context).toMatch(/Savings balance: \$12,000 \(separate account/);
  });

  it('validates source ids and strips inline citations', async () => {
    const { client } = mockClient(final('Funds can lose value [tng-investment-funds].', ['tng-investment-funds', 'invented']));
    const r = await chat(config(client), request('Can I lose money?'));
    expect(r.body.sourceIds).toEqual(['tng-investment-funds']);
    expect(r.body.reply).toBe('Funds can lose value.');
  });

  it('asks the model to revise replies with dollar figures it computed itself', async () => {
    const { client, requests } = mockClient(final('You could invest $15,500 now.'), final('Let’s look at what the money is for first.'));
    const r = await chat(config(client), request('What could I do?', granted));
    expect(requests[1].revision?.note).toMatch(/\$15,500/);
    expect(r.body.reply).toMatch(/what the money is for/);
  });
});

describe('validated allocations', () => {
  it('records the customer’s allocations; the remainder is computed, not invented', async () => {
    const q = 'I need $3,000 for bills and $10,000 for emergencies.';
    const { client, requests } = mockClient(
      tools(
        call('record_allocation', { account: 'chequing', purpose: 'upcoming_expenses', amount: 3000, customer_quote: '$3,000 for bills' }, 'a'),
        call('record_allocation', { account: 'chequing', purpose: 'emergency', amount: 10000, customer_quote: '$10,000 for emergencies' }, 'b'),
      ),
      final('That leaves $15,000 not yet assigned to a purpose.'),
    );
    const r = await chat(config(client), request(q, granted));
    expect(toolOutputs(requests).map((o) => o.status)).toEqual(['applied', 'applied']);
    expect(toolOutputs(requests)[1].notYetAssigned).toBe(15000);
    expect(r.body.effects).toEqual([
      { type: 'allocationsUpdated', allocations: [{ account: 'chequing', purpose: 'upcoming_expenses', amount: 3000 }, { account: 'chequing', purpose: 'emergency', amount: 10000 }] },
    ]);
    expect(requests[1].revision).toBeUndefined();
  });

  it('a correction replaces the earlier amount', async () => {
    const context = { ...EMPTY_CONTEXT, allocations: [{ account: 'chequing' as const, purpose: 'emergency' as const, amount: 10000 }] };
    const { client } = mockClient(tools(call('record_allocation', { account: 'chequing', purpose: 'emergency', amount: 8000, customer_quote: 'keep $8,000 for emergencies' })), final('Updated.'));
    const r = await chat(config(client), request('Actually, keep $8,000 for emergencies.', { ...granted, context }));
    expect(r.body.effects[0]).toEqual({ type: 'allocationsUpdated', allocations: [{ account: 'chequing', purpose: 'emergency', amount: 8000 }] });
  });

  it('rejects allocations above the balance, negatives and amounts not stated', async () => {
    const over = mockClient(tools(call('record_allocation', { account: 'chequing', purpose: 'emergency', amount: 30000, customer_quote: '$30,000 for emergencies' })), final('…'));
    const r1 = await chat(config(over.client), request('I have $30,000 for emergencies.', granted));
    expect(toolOutputs(over.requests)[0]).toMatchObject({ status: 'needs_clarification', reason: 'exceeds_balance' });
    expect(r1.body.effects).toEqual([]);

    const neg = mockClient(tools(call('record_allocation', { account: 'chequing', purpose: 'emergency', amount: 500, customer_quote: '-500 for emergencies' })), final('…'));
    await chat(config(neg.client), request('Keep -500 for emergencies', granted));
    expect(toolOutputs(neg.requests)[0]).toMatchObject({ status: 'rejected', reason: 'negative' });

    const vague = mockClient(tools(call('record_allocation', { account: 'chequing', purpose: 'emergency', amount: 5000, customer_quote: 'some of that money' })), final('How much?'));
    await chat(config(vague.client), request('I need some of that money for emergencies.', granted));
    expect(toolOutputs(vague.requests)[0].status).toBe('needs_clarification');
  });
});

describe('goals, offerings, next steps and calculations', () => {
  it('records a stated goal and shows only valid offering ids', async () => {
    const { client, requests } = mockClient(
      tools(
        call('record_goal', { goal: 'build_wealth', detail: 'learn how investing works', customer_quote: 'I want to build wealth' }, 'g'),
        call('show_offerings', { offering_ids: ['investment-funds', 'tfsa', 'robo-advisor'], reason: 'You want to learn about longer-term investing.' }, 'o'),
      ),
      final('Here are options to learn about.', ['tng-investment-funds']),
    );
    const r = await chat(config(client), request('I want to build wealth, but I don’t know how investing works.'));
    expect(toolOutputs(requests).map((o) => o.status)).toEqual(['applied', 'shown']);
    expect(r.body.effects).toEqual([
      { type: 'goalSet', goal: { type: 'build_wealth', detail: 'learn how investing works' } },
      // Timeline not stated yet: the shared rule keeps flexible options; funds stay because the customer asked about investing.
      { type: 'offeringsShown', ids: ['tfsa', 'investment-funds'], reason: 'You want to learn about longer-term investing.' },
    ]);
  });

  it('won’t show offerings before a goal unless the customer asks about options', async () => {
    const { client, requests } = mockClient(tools(call('show_offerings', { offering_ids: ['investment-funds'], reason: 'x' })), final('…'));
    await chat(config(client), request('Hi, what is this?'));
    expect(toolOutputs(requests)[0].status).toBe('not_needed');
  });

  it('records the chosen next step only from the customer’s words', async () => {
    const ok = mockClient(tools(call('record_next_step', { step: 'learn_risk', customer_quote: 'learn about investment risk first' })), final('Noted.'));
    const r = await chat(config(ok.client), request('I’d like to learn about investment risk first.'));
    expect(r.body.effects).toEqual([{ type: 'nextStepSet', step: 'learn_risk' }]);
    const bad = mockClient(tools(call('record_next_step', { step: 'prepare_questions', customer_quote: 'book an advisor' })), final('…'));
    await chat(config(bad.client), request('Tell me more about GICs.'));
    expect(toolOutputs(bad.requests)[0].status).toBe('needs_clarification');
    // Found in live testing: a real quote that doesn't express a next step must not record one.
    const unchosen = mockClient(tools(call('record_next_step', { step: 'learn_risk', customer_quote: 'I don’t know how investing works' })), final('…'));
    const r2 = await chat(config(unchosen.client), request('I want to build wealth, but I don’t know how investing works.'));
    expect(toolOutputs(unchosen.requests)[0]).toMatchObject({ status: 'needs_clarification', reason: 'step_not_chosen' });
    expect(r2.body.effects).toEqual([]);
  });

  it('calculates only with customer-given or computed values, never returns', async () => {
    const context = {
      ...EMPTY_CONTEXT,
      allocations: [
        { account: 'chequing' as const, purpose: 'upcoming_expenses' as const, amount: 3000 },
        { account: 'chequing' as const, purpose: 'emergency' as const, amount: 10000 },
      ],
    };
    const good = mockClient(tools(call('calculate_scenario', { starting_amount: 15000, monthly: 400, months: 60 })), final('Here’s the arithmetic.'));
    const r = await chat(config(good.client), request('What if I added $400 a month for 60 months?', { ...granted, context }));
    expect(toolOutputs(good.requests)[0]).toMatchObject({ status: 'calculated', result: { total: 39000 } });
    expect(r.body.effects).toEqual([{ type: 'scenario', input: { start: 15000, monthly: 400, months: 60, target: null } }]);

    const invented = mockClient(tools(call('calculate_scenario', { starting_amount: 15000, monthly: 900, months: 60 })), final('…'));
    await chat(config(invented.client), request('What if I added money monthly for 60 months?', { ...granted, context }));
    expect(toolOutputs(invented.requests)[0].status).toBe('not_needed');
  });

  it('guards permission requests, summaries and support previews', async () => {
    const { client, requests } = mockClient(
      tools(call('request_account_permission', { reason: 'x' }, 'p'), call('prepare_summary', {}, 's'), call('prepare_support_preview', { questions: ['q'] }, 'h')),
      final('A TFSA is an account…'),
    );
    const r = await chat(config(client), request('Is a TFSA an investment?'));
    expect(toolOutputs(requests).map((o) => o.status)).toEqual(['not_needed', 'not_needed', 'not_needed']);
    expect(r.body.effects).toEqual([]);
    expect(requests.map((q) => q.allowTools)).toEqual([true, false]);
  });

  it('stops a runaway tool loop', async () => {
    const loop = Array.from({ length: 6 }, () => tools(call('prepare_summary', {})));
    const { client, requests } = mockClient(...loop);
    const r = await chat(config(client), request('Summary please'));
    expect(r.status).toBe(502);
    expect(requests.map((q) => q.allowTools)).toEqual([true, true, true, true, false]);
  });
});

describe('quote grounding and rate limiting', () => {
  it('accepts light paraphrases but not invented words', async () => {
    const { quoteSupported } = await import('./tools');
    const latest = 'i need 3000 for bills and 10000 for emergencies.';
    expect(quoteSupported('3000 for bills', latest)).toBe(true);
    expect(quoteSupported('3000 for rent', latest)).toBe(false);
  });

  it('limits chat requests per client', async () => {
    const { createRateLimiter } = await import('./http');
    let t = 0;
    const allow = createRateLimiter(1000, 2, () => t);
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    t = 1001;
    expect(allow('a')).toBe(true);
  });
});
