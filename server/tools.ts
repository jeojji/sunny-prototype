/**
 * Tools the model may call. Each executor validates its arguments against the
 * request state and returns a JSON string for the model. Side effects are
 * collected as ChatEffects for the client, which re-validates before applying.
 *
 * The model can explain the existing signal but cannot invent balances,
 * history, preferences or completed actions: everything it records must come
 * from the customer's own words or from code.
 */
import { projectWithoutReturns } from '../src/lib/calc.ts';
import { findAmounts, findDurations, normalizeText } from '../src/lib/parse.ts';
import {
  checkAmount,
  GOALS,
  HORIZONS,
  NEXT_STEPS,
  PURPOSES,
  type AllocationDTO,
  type ChatEffect,
  type ChatRequest,
  type ConversationContext,
  type GoalKey,
  type HorizonKey,
  type NextStepKey,
  type PurposeKey,
} from '../src/shared/api.ts';
import { OFFERINGS, validateOfferingIds } from '../src/shared/offerings.ts';

export interface ToolContext {
  req: ChatRequest;
  /** Working copy of customer-confirmed context, updated as proposals are accepted this turn. */
  context: ConversationContext;
  latestCustomer: string;
  effects: ChatEffect[];
}

/** Provider-neutral function tool definitions (JSON Schema parameters). */
export const TOOL_DEFINITIONS = [
  {
    name: 'read_account_snapshot',
    description: 'Read the customer’s synthetic account details (balances, monthly cash flow, the dashboard signal) and current allocations. Only available after permission.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'request_account_permission',
    description: 'Ask permission to use account details for a personalized answer.',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'record_allocation',
    description:
      'Record what part of an account balance the customer says is for a purpose (e.g. "$3,000 for bills"). A later statement for the same account and purpose replaces the earlier one. Validated against the balance.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', enum: ['chequing', 'savings'] },
        purpose: { type: 'string', enum: PURPOSES },
        amount: { type: 'number' },
        customer_quote: { type: 'string', description: 'Exact words from the customer’s latest message stating this amount.' },
      },
      required: ['account', 'purpose', 'amount', 'customer_quote'],
    },
  },
  {
    name: 'record_goal',
    description: 'Record the goal the customer stated in their latest message.',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', enum: GOALS },
        detail: { type: 'string', description: 'Short paraphrase of what they said.' },
        customer_quote: { type: 'string' },
      },
      required: ['goal', 'detail', 'customer_quote'],
    },
  },
  {
    name: 'record_time_horizon',
    description: 'Record roughly when the customer might need the money, as they stated it.',
    parameters: {
      type: 'object',
      properties: { horizon: { type: 'string', enum: HORIZONS }, customer_quote: { type: 'string' } },
      required: ['horizon', 'customer_quote'],
    },
  },
  {
    name: 'show_offerings',
    description: `Show verified Tangerine offerings as a card. Valid ids: ${OFFERINGS.map((o) => o.id).join(', ')}. Use when the customer has a stated goal or asks about Tangerine options.`,
    parameters: {
      type: 'object',
      properties: {
        offering_ids: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string', description: 'Why these are relevant to explore, in terms of what the customer said (not suitability).' },
      },
      required: ['offering_ids', 'reason'],
    },
  },
  {
    name: 'record_next_step',
    description: 'Record the next step the customer chose.',
    parameters: {
      type: 'object',
      properties: { step: { type: 'string', enum: NEXT_STEPS }, customer_quote: { type: 'string' } },
      required: ['step', 'customer_quote'],
    },
  },
  {
    name: 'calculate_scenario',
    description:
      'Illustrative arithmetic: starting amount + equal monthly amounts, optional target. No interest or returns. Values must come from the customer or the amount not yet assigned.',
    parameters: {
      type: 'object',
      properties: {
        starting_amount: { type: 'number' },
        monthly: { type: 'number' },
        months: { type: 'integer' },
        target: { type: 'number' },
      },
      required: ['starting_amount', 'monthly', 'months'],
    },
  },
  {
    name: 'prepare_summary',
    description: 'Prepare the conversation summary for the customer to review.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'prepare_support_preview',
    description: 'Prepare a human-support preview (concept only; nothing is sent or booked) with the customer’s questions.',
    parameters: { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'] },
  },
];

type ToolResult = Record<string, unknown>;

const PERSONAL_RE =
  /\bmy (balance|balances|account|accounts|chequing|savings|money|cash|income|spending|budget|situation|numbers)\b|this money|that money|how much (do|can|could|should|would) i|what (can|could) i (save|afford)|\bscenario\b|\bcan i afford\b|use my (account|details)/;
const SUPPORT_RE = /human|person|advis|someone|support|talk to|speak (to|with)|call (me|them|tangerine)|representative|appointment|questions? (for|to ask)/;
const SUMMARY_RE = /summar|recap|wrap (it )?up|save (this|our|the) conversation|print/;
const OFFERINGS_RE = /tangerine|option|product|account|fund|gic|tfsa|rrsp|rsp|portfolio|offer|compare|what can/;

/** What the customer's own words must contain for each recorded choice (meaning check on top of the quote check). */
const NEXT_STEP_WORDS: Record<NextStepKey, RegExp> = {
  learn_risk: /risk/,
  compare_options: /compar|side by side|difference/,
  explore_scenario: /scenario|calculat|what if|illustrat|numbers/,
  read_product_page: /page|website|official|read/,
  prepare_questions: /question|advis|person|talk to|speak/,
  save_for_later: /later|come back|save (this|it)|remind/,
  not_proceeding: /not (right )?now|no thanks|not ready|don.t want|stop|not interested/,
};
const GOAL_WORDS: Record<GoalKey, RegExp> = {
  build_wealth: /wealth|invest|grow|long.term|retire/,
  accessible_interest: /access|interest|safe|savings|available/,
  first_home: /home|house|condo|down payment|fhsa/,
  understand_options: /understand|options|learn|before deciding|not sure/,
  other: /./,
};
const HORIZON_WORDS: Record<HorizonKey, RegExp> = {
  under_1_year: /year|month|soon/,
  '1_to_5_years': /year/,
  over_5_years: /year|long|decade|retire|5|five/,
  not_sure: /sure|know|idea|unsure/,
};

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'my', 'is', 'it', 'to', 'for', 'and', 'i', 'im', 'ive', 'am', 'are', 'be', 'that', 'this', 'about', 'some', 'just', 'actually', 'so', 'in', 'on']);
const tokens = (t: string) => t.replace(/[^a-z0-9.\s-]/g, ' ').split(/\s+/).filter((w) => w && !STOPWORDS.has(w));

/** The quote must come from the latest customer message: verbatim, or a light paraphrase of its words and numbers. */
export function quoteSupported(quote: string, latest: string): boolean {
  if (latest.includes(quote)) return true;
  const q = tokens(quote);
  const l = new Set(tokens(latest));
  return q.length > 0 && q.every((w) => l.has(w));
}

function balanceOf(ctx: ToolContext, account: 'chequing' | 'savings'): number | null {
  if (ctx.req.permission !== 'granted' || !ctx.req.account) return null;
  return account === 'chequing' ? ctx.req.account.chequingBalance : ctx.req.account.savingsBalance;
}

function unassigned(ctx: ToolContext, account: 'chequing' | 'savings'): number | null {
  const bal = balanceOf(ctx, account);
  if (bal === null) return null;
  const allocated = ctx.context.allocations.filter((a) => a.account === account).reduce((s, a) => s + a.amount, 0);
  return Math.max(0, Math.round((bal - allocated) * 100) / 100);
}

function upsertEffect<T extends ChatEffect['type']>(ctx: ToolContext, type: T, effect: Extract<ChatEffect, { type: T }>) {
  ctx.effects = ctx.effects.filter((e) => e.type !== type);
  ctx.effects.push(effect);
}

function quoteCheck(args: Record<string, unknown>, ctx: ToolContext): ToolResult | null {
  const quote = normalizeText(typeof args.customer_quote === 'string' ? args.customer_quote : '');
  if (!quote || !quoteSupported(quote, normalizeText(ctx.latestCustomer))) {
    return {
      status: 'needs_clarification',
      reason: 'not_stated_in_latest_message',
      instruction: 'Only record what the customer just said, in their words. Ask them to confirm.',
    };
  }
  return null;
}

function recordAllocation(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const account = args.account === 'savings' ? 'savings' : args.account === 'chequing' ? 'chequing' : null;
  const purpose = PURPOSES.includes(args.purpose as PurposeKey) ? (args.purpose as PurposeKey) : null;
  if (!account || !purpose) return { status: 'rejected', reason: 'invalid_account_or_purpose' };
  const bad = quoteCheck(args, ctx);
  if (bad) return bad;
  const quote = normalizeText(String(args.customer_quote));
  if (findAmounts(quote).some((a) => a.negative)) return { status: 'rejected', reason: 'negative', instruction: 'Amounts must be $0 or more. Ask what they meant.' };
  const issue = checkAmount(args.amount);
  if (issue) return { status: 'rejected', reason: issue, instruction: 'Do not record this. Ask the customer to clarify.' };
  const amount = args.amount as number;
  if (!findAmounts(quote).some((a) => !a.negative && a.value === amount)) {
    return { status: 'needs_clarification', reason: 'amount_not_in_quote', instruction: 'The amount doesn’t match what the customer said. Ask a short clarifying question.' };
  }
  const next: AllocationDTO[] = [...ctx.context.allocations.filter((a) => !(a.account === account && a.purpose === purpose)), { account, purpose, amount }];
  const bal = balanceOf(ctx, account);
  const total = next.filter((a) => a.account === account).reduce((s, a) => s + a.amount, 0);
  if (bal !== null && total > bal) {
    return {
      status: 'needs_clarification',
      reason: 'exceeds_balance',
      accountBalance: bal,
      totalAllocated: total,
      instruction: 'Allocations would exceed this account’s balance. Ask whether some is held elsewhere or whether to adjust the amounts. Do not record it.',
    };
  }
  ctx.context = { ...ctx.context, allocations: next };
  upsertEffect(ctx, 'allocationsUpdated', { type: 'allocationsUpdated', allocations: next });
  return {
    status: 'applied',
    allocations: next,
    notYetAssigned: unassigned(ctx, account),
    note: bal === null ? 'Balance not shared; the app will validate against the actual balance.' : 'Describe any remainder as “not yet assigned to a purpose”, never as “available to invest”.',
  };
}

function calculate(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const start = args.starting_amount;
  const monthly = args.monthly;
  const months = args.months;
  const target = typeof args.target === 'number' ? args.target : null;
  // Every value must come from a customer message or the computed not-yet-assigned amount.
  const customerText = normalizeText(ctx.req.messages.filter((m) => m.role === 'customer').map((m) => m.text).join(' \n '));
  const stated = new Set(findAmounts(customerText).map((a) => (a.negative ? -a.value : a.value)));
  const statedMonths = new Set(findDurations(customerText));
  const derived = new Set([unassigned(ctx, 'chequing'), ...ctx.context.allocations.map((a) => a.amount)].filter((n): n is number => n !== null));
  const ok = (n: unknown) => typeof n === 'number' && (n === 0 || stated.has(n) || derived.has(n));
  if (!ok(start) || !ok(monthly) || !(typeof months === 'number' && (statedMonths.has(months) || stated.has(months))) || (target !== null && !stated.has(target))) {
    return {
      status: 'not_needed',
      instruction: 'Only calculate with values the customer gave (or the amount not yet assigned). Ask for any missing value instead of assuming.',
    };
  }
  const input = { start: start as number, monthly: monthly as number, months: months as number, target };
  const r = projectWithoutReturns(input);
  if (!r.valid) return { status: 'rejected', errors: r.errors, instruction: 'Ask the customer for valid values.' };
  upsertEffect(ctx, 'scenario', { type: 'scenario', input });
  return {
    status: 'calculated',
    input,
    result: { contributions: r.contributions, total: r.total, gapAtEnd: r.gapAtEnd, monthlyThatReachesTarget: r.requiredMonthly },
    note: 'Contributions only: no interest or investment returns, not a forecast. The app shows a scenario card.',
  };
}

export function executeTool(name: string, rawArgs: string, ctx: ToolContext): string {
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawArgs || '{}');
    args = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return JSON.stringify({ status: 'error', reason: 'invalid_arguments' });
  }
  return JSON.stringify(run(name, args, ctx));
}

function run(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const latest = ctx.latestCustomer.toLowerCase();
  switch (name) {
    case 'read_account_snapshot': {
      if (ctx.req.permission !== 'granted' || !ctx.req.account) {
        return {
          status: 'permission_required',
          instruction: ctx.req.permission === 'declined' ? 'The customer chose to keep it general. Answer generally.' : 'Answer generally unless account details would genuinely help.',
        };
      }
      return {
        status: 'ok',
        account: ctx.req.account,
        allocations: ctx.context.allocations,
        chequingNotYetAssigned: unassigned(ctx, 'chequing'),
        note: 'Balances don’t say what money is for. Ask before assuming any of it is available.',
      };
    }
    case 'request_account_permission': {
      if (ctx.req.permission === 'granted') return { status: 'already_granted' };
      if (!PERSONAL_RE.test(latest)) return { status: 'not_needed', instruction: 'This is a general question. Answer without account details.' };
      if (ctx.req.permission === 'declined' && !/account|balance|details/.test(latest)) {
        return { status: 'customer_declined', instruction: 'Do not ask again; continue generally.' };
      }
      upsertEffect(ctx, 'requestPermission', { type: 'requestPermission', reason: String(args.reason ?? '').slice(0, 160) });
      return { status: 'permission_requested', instruction: 'Ask for permission in your reply. The app shows the buttons.' };
    }
    case 'record_allocation':
      return recordAllocation(args, ctx);
    case 'record_goal': {
      const goal = GOALS.includes(args.goal as GoalKey) ? (args.goal as GoalKey) : null;
      if (!goal) return { status: 'rejected', reason: 'invalid_goal' };
      const bad = quoteCheck(args, ctx);
      if (bad) return bad;
      if (!GOAL_WORDS[goal].test(latest)) return { status: 'needs_clarification', reason: 'goal_not_stated', instruction: 'The customer didn’t state this goal. Ask what they’d like the money to help them do.' };
      const g = { type: goal, detail: typeof args.detail === 'string' ? args.detail.slice(0, 200) : null };
      ctx.context = { ...ctx.context, goal: g };
      upsertEffect(ctx, 'goalSet', { type: 'goalSet', goal: g });
      return { status: 'applied', goal: g, instruction: 'Answer what they asked first, then at most one follow-up (e.g. when they might need the money). Don’t force a numerical target.' };
    }
    case 'record_time_horizon': {
      const horizon = HORIZONS.includes(args.horizon as HorizonKey) ? (args.horizon as HorizonKey) : null;
      if (!horizon) return { status: 'rejected', reason: 'invalid_horizon' };
      const bad = quoteCheck(args, ctx);
      if (bad) return bad;
      if (!HORIZON_WORDS[horizon].test(latest)) return { status: 'needs_clarification', reason: 'horizon_not_stated', instruction: 'The customer didn’t say when they might need the money. Ask.' };
      ctx.context = { ...ctx.context, horizon };
      upsertEffect(ctx, 'horizonSet', { type: 'horizonSet', horizon });
      return { status: 'applied', horizon };
    }
    case 'show_offerings': {
      if (!ctx.context.goal && !OFFERINGS_RE.test(latest)) {
        return { status: 'not_needed', instruction: 'Introduce offerings once the customer has a stated goal or asks about options.' };
      }
      const ids = validateOfferingIds(args.offering_ids);
      if (!ids.length) return { status: 'rejected', reason: 'no_valid_offering_ids', validIds: OFFERINGS.map((o) => o.id) };
      const reason = String(args.reason ?? '').slice(0, 200);
      ctx.context = { ...ctx.context, offeringsViewed: [...new Set([...ctx.context.offeringsViewed, ...ids])] };
      upsertEffect(ctx, 'offeringsShown', { type: 'offeringsShown', ids, reason });
      return {
        status: 'shown',
        offerings: ids.map((id) => OFFERINGS.find((o) => o.id === id)),
        instruction: 'The card shows features, fees and risks. Explain why they’re relevant to explore using what the customer said, not that they’re suitable or best. Mention they aren’t the only options.',
      };
    }
    case 'record_next_step': {
      const step = NEXT_STEPS.includes(args.step as NextStepKey) ? (args.step as NextStepKey) : null;
      if (!step) return { status: 'rejected', reason: 'invalid_step' };
      const bad = quoteCheck(args, ctx);
      if (bad) return bad;
      if (!NEXT_STEP_WORDS[step].test(latest)) {
        return { status: 'needs_clarification', reason: 'step_not_chosen', instruction: 'The customer didn’t choose this next step. Offer next steps instead of recording one.' };
      }
      ctx.context = { ...ctx.context, nextStep: step };
      upsertEffect(ctx, 'nextStepSet', { type: 'nextStepSet', step });
      return { status: 'applied', step, instruction: 'Confirm it simply. Nothing real happens (no accounts, transfers, bookings or messages).' };
    }
    case 'calculate_scenario':
      return calculate(args, ctx);
    case 'prepare_summary':
      if (!SUMMARY_RE.test(latest)) return { status: 'not_needed', instruction: 'The customer did not ask for a summary.' };
      upsertEffect(ctx, 'summaryReady', { type: 'summaryReady' });
      return { status: 'ready', instruction: 'Tell the customer their summary is ready to review.' };
    case 'prepare_support_preview': {
      if (!SUPPORT_RE.test(latest)) return { status: 'not_needed', instruction: 'The customer did not ask for a person.' };
      const questions = (Array.isArray(args.questions) ? args.questions : [])
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim().slice(0, 200))
        .slice(0, 5);
      upsertEffect(ctx, 'handoffReady', { type: 'handoffReady', questions });
      return { status: 'ready', instruction: 'Say a concept preview is ready; nothing is sent or booked.' };
    }
    default:
      return { status: 'error', reason: 'unknown_tool' };
  }
}
