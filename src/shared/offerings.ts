/**
 * Tangerine offerings Sunny can introduce, built only from verified knowledge
 * entries (src/shared/knowledge.ts). Showing an offering means "relevant to
 * learn about given what the customer said", never "suitable" or "best".
 */
import { getEntry } from './knowledge.ts';

export type GoalType = 'build_wealth' | 'accessible_interest' | 'first_home' | 'understand_options' | 'other';

export interface Offering {
  id: string;
  name: string;
  /** One-line plain-language description. */
  summary: string;
  features: string[];
  /** Fees, access restrictions and other conditions. */
  conditions: string[];
  risks: string[];
  /** Knowledge-base ids that support every statement above. */
  sources: string[];
  /** Goals this is relevant to explore for (not a suitability judgment). */
  relevantFor: GoalType[];
}

export const OFFERINGS: Offering[] = [
  {
    id: 'savings-account',
    name: 'Tangerine Savings Account',
    summary: 'Keeps money accessible while it earns interest.',
    features: ['No monthly fee, no minimum balance', 'Interest calculated daily, paid monthly (rates can change)', 'Up to 10 savings accounts for separate goals', 'Automatic Savings Program you can change or cancel'],
    conditions: ['A fee applies to transfers to another financial institution'],
    risks: ['Interest may not keep up with rising costs'],
    sources: ['tng-savings-account', 'tng-saving-vs-investing'],
    relevantFor: ['accessible_interest', 'first_home', 'understand_options', 'other'],
  },
  {
    id: 'tfsa',
    name: 'Tangerine TFSA (savings, GIC or investment funds)',
    summary: 'A tax-free account; what you hold inside it can be savings, a GIC or investment funds.',
    features: ['TFSA Savings Account, Tax-Free GIC, or Tax-Free Investment Fund Account', 'Growth generally tax-free; withdraw any time', 'No fees while funds stay with Tangerine'],
    conditions: ['You’re responsible for staying within your contribution room', 'A fee applies when transferring out to another institution'],
    risks: ['Risk depends on the holding: savings and GICs differ from investment funds'],
    sources: ['tng-tfsa-options', 'gov-tfsa'],
    relevantFor: ['build_wealth', 'accessible_interest', 'first_home', 'understand_options', 'other'],
  },
  {
    id: 'rsp',
    name: 'Tangerine RSP (savings, GIC or investment funds)',
    summary: 'A registered retirement account with tax-deductible contributions.',
    features: ['RSP Savings Account, RSP GIC, or RSP Investment Fund Account', 'Contributions tax deductible; growth tax-deferred'],
    conditions: ['Withdrawals are taxable income, with tax withheld', '$50 fee to transfer an RSP to another institution'],
    risks: ['Risk depends on the holding inside the account'],
    sources: ['tng-rsp-options', 'gov-rrsp'],
    relevantFor: ['build_wealth', 'understand_options'],
  },
  {
    id: 'gic',
    name: 'Tangerine GICs',
    summary: 'Your principal back at the end of a set term, plus interest.',
    features: ['Terms from short (e.g. 90 days) to multiple years', 'No minimum to open', 'Available in a TFSA, RSP, RIF or non-registered'],
    conditions: ['Not cashable before maturity, except approved financial-hardship redemptions'],
    risks: ['Money is locked in for the term'],
    sources: ['tng-gic', 'fcac-gic-rights'],
    relevantFor: ['build_wealth', 'accessible_interest', 'first_home', 'understand_options'],
  },
  {
    id: 'investment-funds',
    name: 'Tangerine Investment Funds',
    summary: 'Diversified mutual-fund portfolios for longer-term investing.',
    features: ['Core, Global ETF and Socially Responsible Global portfolios; Money Market Fund', 'Can be held in a TFSA, RSP, RIF or non-registered account'],
    conditions: [
      'Management fees: 0.80% Core, 0.50% Global ETF, 0.55% Socially Responsible, plus a 0.15% administration fee and other fund expenses',
      'Read the prospectus before investing',
    ],
    risks: ['Not guaranteed and not CDIC-insured', 'Values change frequently; you can lose money'],
    sources: ['tng-investment-funds', 'cdic-coverage'],
    relevantFor: ['build_wealth', 'understand_options'],
  },
  {
    id: 'advisors',
    name: 'Tangerine Advisors',
    summary: 'Phone or video consultations about investing and financial planning.',
    features: ['No-obligation investment consultation', 'Book online (not in this prototype)', 'Tangerine says advisors aren’t paid commissions based on what you choose'],
    conditions: ['Advice fees or minimums aren’t stated on Tangerine’s page'],
    risks: [],
    sources: ['tng-advisors'],
    relevantFor: ['build_wealth', 'understand_options'],
  },
];

const BY_ID = new Map(OFFERINGS.map((o) => [o.id, o]));

export function getOffering(id: string): Offering | undefined {
  return BY_ID.get(id);
}

/** Keep only real offering ids, de-duplicated, in order. */
export function validateOfferingIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const id of ids) if (typeof id === 'string' && BY_ID.has(id) && !out.includes(id)) out.push(id);
  return out.slice(0, 6);
}

/** Offerings relevant to explore for a goal, in catalogue order. */
export function offeringsFor(goal: GoalType | null): Offering[] {
  return OFFERINGS.filter((o) => o.relevantFor.includes(goal ?? 'understand_options'));
}

/** The official page for an offering (first source). */
export function offeringUrl(o: Offering): string | undefined {
  return getEntry(o.sources[0])?.url;
}

export type HorizonType = 'under_1_year' | '1_to_5_years' | 'over_5_years' | 'not_sure';
export type Emphasis = 'access' | 'balanced' | 'growth' | 'flexible';

export interface OfferingPlan {
  ids: string[];
  emphasis: Emphasis;
}

const SHORT_TERM = ['savings-account', 'gic', 'tfsa'];

/**
 * Deterministic rule for the *initial* product exploration, used by both the
 * scripted engine and the server tool. It decides what's relevant to learn
 * about first given the customer's stated goal and timeline. It is not a
 * suitability decision or an allocation, and the full catalogue stays one
 * click away ("Browse all Tangerine offerings").
 *  - Within a year: access and stability first (savings, GIC terms and restrictions, TFSA savings).
 *  - 1–5 years: access and stability, plus investment funds only if the goal is building wealth or understanding options.
 *  - More than 5 years: the goal's full set, which can include investment education and funds.
 *  - Not sure / not stated: flexible options while the timeline is clarified.
 */
export function offeringPlan(goal: GoalType | null, horizon: HorizonType | null): OfferingPlan {
  if (horizon === 'under_1_year') return { ids: SHORT_TERM, emphasis: 'access' };
  if (horizon === '1_to_5_years') {
    const growth = goal === 'build_wealth' || goal === 'understand_options';
    return { ids: growth ? [...SHORT_TERM, 'investment-funds'] : SHORT_TERM, emphasis: 'balanced' };
  }
  if (horizon === 'over_5_years') return { ids: offeringsFor(goal).map((o) => o.id), emphasis: goal === 'build_wealth' ? 'growth' : 'balanced' };
  return { ids: SHORT_TERM, emphasis: 'flexible' };
}
