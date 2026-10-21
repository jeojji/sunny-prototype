/**
 * Tools the model may call. Each executor validates its arguments against the
 * request state and returns a JSON string for the model. Side effects are
 * collected as ChatEffects for the client, which re-validates before applying.
 */
import { calculateScenario, monthlyCashFlow, type ScenarioInput } from '../src/lib/calc.ts';
import { findAmounts, findDurations, normalizeText } from '../src/lib/parse.ts';
import { checkFactValue, type ChatEffect, type ChatRequest, type FactField, type FactPatch, type StatedFacts } from '../src/shared/api.ts';

export interface ToolContext {
  req: ChatRequest;
  /** Working copy of facts, updated as proposals are accepted during this turn. */
  facts: StatedFacts;
  latestCustomer: string;
  effects: ChatEffect[];
}

const FACT_FIELDS: FactField[] = ['target', 'homeSavings', 'reservedSeparately', 'monthly', 'timelineMonths'];

/** Provider-neutral function tool definitions (JSON Schema parameters). */
export const TOOL_DEFINITIONS = [
  {
    name: 'read_account_snapshot',
    description: 'Read the customer’s synthetic account snapshot (balances and monthly cash flow). Only available after permission is granted.',
    parameters: { type: 'object', properties: {}, required: []},
  },
  {
    name: 'request_snapshot_permission',
    description: 'Ask the customer for permission to use their account snapshot for a personalized answer.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Short, customer-facing reason (under 140 characters).' } },
      required: ['reason'],
    },
  },
  {
    name: 'propose_fact_update',
    description: 'Record a goal fact the customer stated in their latest message. Validated before it is applied.',
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: FACT_FIELDS },
        value: { type: 'number', description: 'Dollars, or whole months for timelineMonths.' },
        customer_quote: { type: 'string', description: 'Exact words from the customer’s latest message that state this fact.' },
        held_elsewhere_confirmed: {
          type: 'boolean',
          description: 'True only if the customer explicitly said some home savings are held outside the snapshot accounts.',
        },
      },
      required: ['field', 'value', 'customer_quote', 'held_elsewhere_confirmed'],
    },
  },
  {
    name: 'calculate_scenario',
    description:
      'Deterministic savings arithmetic from the customer’s stated facts. Pass monthly/months only for an explicit what-if; otherwise omit them.',
    parameters: {
      type: 'object',
      properties: {
        monthly: { type: 'number', description: 'What-if monthly amount; omit to use the stated amount.' },
        months: { type: 'integer', description: 'What-if timeline in months; omit to use the stated timeline.' },
      },
      required: [],
    },
  },
  {
    name: 'prepare_summary',
    description: 'Prepare the conversation summary for the customer to review.',
    parameters: { type: 'object', properties: {}, required: []},
  },
  {
    name: 'prepare_support_preview',
    description: 'Prepare a human-support preview (concept only; nothing is sent) with questions the customer wants help with.',
    parameters: {
      type: 'object',
      properties: { questions: { type: 'array', items: { type: 'string' } } },
      required: ['questions'],
    },
  },
];

type ToolResult = Record<string, unknown>;

/** The customer is asking about their own numbers (where a snapshot could genuinely help). */
const PERSONAL_RE =
  /\bmy (savings|balance|balances|account|accounts|budget|income|spending|cash|money|situation|numbers|goal|target|plan)\b|how much (do|can|could|should|would) i (have|save|afford|put)|what (can|could) i (save|afford)|\bscenario\b|\bon track\b|\bcan i afford\b|\buse my (account|snapshot)/;
/** The customer asked for a person or support. */
const SUPPORT_RE = /human|person|advis|someone|support|talk to|speak (to|with)|call (me|them|tangerine)|representative|specialist|appointment|questions? (for|to ask)/;
/** The customer asked for a summary. */
const SUMMARY_RE = /summar|recap|wrap (it )?up|save (this|our|the) conversation|print/;

const ELSEWHERE_RE = /elsewhere|another (bank|account|institution)|other (bank|account|institution|accounts)|outside|somewhere else|separate account|different bank/;

function snapshotSavings(ctx: ToolContext): number | null {
  return ctx.req.snapshotPermission === 'granted' && ctx.req.snapshot ? ctx.req.snapshot.savingsBalance : null;
}

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'my', 'is', 'it', 'to', 'for', 'and', 'i', 'im', 'ive', 'am', 'are', 'be', 'that', 'this', 'about', 'some', 'just', 'actually', 'so', 'in', 'on']);
const tokens = (t: string) => t.replace(/[^a-z0-9.\s-]/g, ' ').split(/\s+/).filter((w) => w && !STOPWORDS.has(w));

/**
 * The quote must come from the customer's latest message: verbatim, or a light
 * paraphrase whose every meaningful word and number appears in that message.
 */
export function quoteSupported(quote: string, latest: string): boolean {
  if (latest.includes(quote)) return true;
  const q = tokens(quote);
  const l = new Set(tokens(latest));
  return q.length > 0 && q.every((w) => l.has(w));
}

/** Is `value` stated in (or directly derivable from) the customer's quote? */
function grounded(field: FactField, value: number, quote: string, ctx: ToolContext): boolean {
  if (field === 'timelineMonths') {
    if (findDurations(quote).includes(value)) return true;
    return findAmounts(quote).some((a) => !a.negative && a.value === value) && /month/.test(quote);
  }
  const amounts = findAmounts(quote).filter((a) => !a.negative).map((a) => a.value);
  if (amounts.includes(value)) return true;
  const savings = snapshotSavings(ctx);
  if (savings === null) return false;
  // Allocation derived from the snapshot: "keep $10,000 aside" → 24,000 − 10,000.
  if (field === 'homeSavings' || field === 'reservedSeparately') {
    if (amounts.some((a) => a <= savings && savings - a === value)) return true;
    if (value === savings && /\b(all|everything|whole|entire)\b/.test(quote)) return true;
  }
  return false;
}

function proposeFactUpdate(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const field = args.field as FactField;
  const value = args.value;
  const rawQuote = typeof args.customer_quote === 'string' ? args.customer_quote : '';
  if (!FACT_FIELDS.includes(field)) return { status: 'rejected', reason: 'unknown_field' };

  const quote = normalizeText(rawQuote);
  const latest = normalizeText(ctx.latestCustomer);
  if (!quote || !quoteSupported(quote, latest)) {
    return {
      status: 'needs_clarification',
      reason: 'not_stated_in_latest_message',
      instruction: 'Only record facts the customer just stated. Ask them to confirm the amount or timeline in their own words.',
    };
  }
  if (findAmounts(quote).some((a) => a.negative)) {
    return { status: 'rejected', reason: 'negative', instruction: 'Explain amounts must be $0 or more and ask what they meant.' };
  }
  const issue = checkFactValue(field, value);
  if (issue) {
    return { status: 'rejected', reason: issue, instruction: 'Do not record this. Ask the customer to clarify.' };
  }
  const n = value as number;
  if (!grounded(field, n, quote, ctx)) {
    return {
      status: 'needs_clarification',
      reason: 'value_not_found_in_quote',
      instruction: 'The value does not match what the customer said. Ask a short clarifying question.',
    };
  }

  const savings = snapshotSavings(ctx);
  let heldElsewhere: boolean | undefined;
  if (savings !== null && (field === 'homeSavings' || field === 'reservedSeparately') && n > savings) {
    const confirmed = args.held_elsewhere_confirmed === true && ELSEWHERE_RE.test(normalizeText(ctx.latestCustomer));
    if (!confirmed || field === 'reservedSeparately') {
      return {
        status: 'needs_clarification',
        reason: 'exceeds_snapshot_savings',
        snapshotSavingsBalance: savings,
        instruction: 'This is more than the snapshot savings balance. Ask whether some of this money is held elsewhere before recording it.',
      };
    }
    heldElsewhere = true;
  }

  const patch: FactPatch = { [field]: n };
  // Keep the allocation consistent: the reserve and the home goal come out of the same snapshot savings.
  let note: string | undefined;
  if (savings !== null && !heldElsewhere && !ctx.facts.homeSavingsHeldElsewhere) {
    if (field === 'reservedSeparately' && (ctx.facts.homeSavings === null || ctx.facts.homeSavings + n > savings)) {
      patch.homeSavings = savings - n;
      note = `Home-goal savings set to ${savings - n} (snapshot savings ${savings} minus ${n} kept separate).`;
    } else if (field === 'homeSavings' && ctx.facts.reservedSeparately !== null && ctx.facts.reservedSeparately + n > savings) {
      patch.reservedSeparately = savings - n;
      note = `Amount kept separate adjusted to ${savings - n} so the total matches snapshot savings of ${savings}.`;
    }
  }
  ctx.facts = { ...ctx.facts, ...patch, ...(heldElsewhere ? { homeSavingsHeldElsewhere: true } : {}) };
  const existing = ctx.effects.find((e) => e.type === 'factsUpdated');
  if (existing && existing.type === 'factsUpdated') {
    Object.assign(existing.patch, patch);
    if (heldElsewhere) existing.heldElsewhere = true;
  } else {
    ctx.effects.push({ type: 'factsUpdated', patch, ...(heldElsewhere ? { heldElsewhere } : {}) });
  }
  return { status: 'applied', field, value: n, ...(note ? { note } : {}), currentFacts: ctx.facts };
}

function calculate(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const f = ctx.facts;
  // What-if values must come from the customer's latest message; otherwise use stated facts.
  // Any recent customer message counts: the customer may have given the value a turn earlier.
  const customerText = normalizeText(
    ctx.req.messages
      .filter((m) => m.role === 'customer')
      .map((m) => m.text)
      .join(' \n '),
  );
  const statedAmounts = findAmounts(customerText).map((a) => (a.negative ? -a.value : a.value));
  const statedMonths = findDurations(customerText);
  const whatIfMonthly = typeof args.monthly === 'number' && args.monthly !== f.monthly ? args.monthly : undefined;
  const whatIfMonths = typeof args.months === 'number' && args.months !== f.timelineMonths ? args.months : undefined;
  if (
    (whatIfMonthly !== undefined && !statedAmounts.includes(whatIfMonthly)) ||
    (whatIfMonths !== undefined && !statedMonths.includes(whatIfMonths) && !statedAmounts.includes(whatIfMonths))
  ) {
    return {
      status: 'not_needed',
      instruction: 'Only run a what-if with values the customer gave. Record stated facts with propose_fact_update, then call calculate_scenario without arguments.',
    };
  }
  const monthly = whatIfMonthly ?? f.monthly;
  const months = whatIfMonths ?? f.timelineMonths;
  const missing: string[] = [];
  if (f.homeSavings === null) missing.push('savings set aside for the home goal');
  if (f.target === null) missing.push('a self-selected savings target');
  if (monthly === null) missing.push('a monthly amount to explore');
  if (months === null) missing.push('a timeline in months');
  if (missing.length) return { status: 'missing_information', missing };

  const input: ScenarioInput = {
    startingSavings: f.homeSavings as number,
    target: f.target as number,
    monthly: monthly as number,
    months: months as number,
  };
  const r = calculateScenario(input);
  if (!r.valid) return { status: 'rejected', errors: r.errors, instruction: 'Ask the customer for valid values.' };
  const hypothetical = input.monthly !== f.monthly || input.months !== f.timelineMonths;
  ctx.effects = ctx.effects.filter((e) => e.type !== 'scenario');
  ctx.effects.push({ type: 'scenario', input, hypothetical });
  return {
    status: 'calculated',
    hypothetical,
    input,
    result: {
      gapToday: r.gap,
      totalAtEnd: r.projectedTotal,
      remainingGap: r.remainingGap,
      amountAboveTarget: r.amountAboveTarget,
      targetAlreadyReached: r.targetAlreadyReached,
      monthlyAmountThatReachesTarget: input.monthly > 0 ? r.requiredMonthly : null,
    },
    note: 'Illustrative arithmetic only: excludes interest, returns, fees, taxes and changes in circumstances. The app shows a scenario card.',
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
  const result = run(name, args, ctx);
  return JSON.stringify(result);
}

function run(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  switch (name) {
    case 'read_account_snapshot': {
      if (ctx.req.snapshotPermission !== 'granted' || !ctx.req.snapshot) {
        return {
          status: 'permission_required',
          instruction:
            ctx.req.snapshotPermission === 'declined'
              ? 'The customer declined. Answer generally or ask them to share figures themselves.'
              : 'Call request_snapshot_permission if the snapshot would genuinely help; otherwise answer generally.',
        };
      }
      const s = ctx.req.snapshot;
      return {
        status: 'ok',
        snapshot: s,
        monthlyLeftAfterExpenses: monthlyCashFlow(s.monthlyIncome, s.monthlyExpenses, s.otherSavingsCommitments),
        note: 'Balances do not say how the customer has earmarked savings. Ask before assuming any of it is for the home.',
      };
    }
    case 'request_snapshot_permission': {
      if (ctx.req.snapshotPermission === 'granted') return { status: 'already_granted' };
      if (ctx.req.snapshotPermission === 'declined' && !/snapshot|account|balance/.test(ctx.latestCustomer.toLowerCase())) {
        return { status: 'customer_declined', instruction: 'Do not ask again; continue without account data.' };
      }
      if (!PERSONAL_RE.test(ctx.latestCustomer.toLowerCase())) {
        return {
          status: 'not_needed',
          instruction: 'This is a general question. Answer it without account data and do not ask for snapshot access.',
        };
      }
      const reason = String(args.reason ?? '').slice(0, 160);
      if (!ctx.effects.some((e) => e.type === 'requestSnapshotPermission')) {
        ctx.effects.push({ type: 'requestSnapshotPermission', reason });
      }
      return { status: 'permission_requested', instruction: 'Ask for permission in your reply. The app shows Allow / Not now buttons.' };
    }
    case 'propose_fact_update':
      return proposeFactUpdate(args, ctx);
    case 'calculate_scenario':
      return calculate(args, ctx);
    case 'prepare_summary':
      if (!SUMMARY_RE.test(ctx.latestCustomer.toLowerCase())) {
        return { status: 'not_needed', instruction: 'The customer did not ask for a summary. Just answer their message.' };
      }
      if (!ctx.effects.some((e) => e.type === 'summaryReady')) ctx.effects.push({ type: 'summaryReady' });
      return { status: 'ready', facts: ctx.facts, instruction: 'Tell the customer their summary is ready to review.' };
    case 'prepare_support_preview': {
      if (!SUPPORT_RE.test(ctx.latestCustomer.toLowerCase())) {
        return { status: 'not_needed', instruction: 'The customer did not ask for human support. Just answer their message.' };
      }
      const questions = (Array.isArray(args.questions) ? args.questions : [])
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim().slice(0, 200))
        .slice(0, 5);
      ctx.effects = ctx.effects.filter((e) => e.type !== 'handoffReady');
      ctx.effects.push({ type: 'handoffReady', questions });
      return { status: 'ready', instruction: 'Say a concept preview is ready to review; nothing is sent or booked.' };
    }
    default:
      return { status: 'error', reason: 'unknown_tool' };
  }
}
