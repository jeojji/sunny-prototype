/**
 * Conversation navigation: which follow-ups to offer next. Pure.
 *
 * Rules: never offer the topic just answered; prefer unexplored topics related
 * to it, then topics for the customer's goal, timeline or earmarked money, then
 * general topics; only fall back to already-explored topics to fill space.
 */
import { TOPICS, TOPICS_FOR_GOAL, type TopicId } from '../data/education';
import type { ConversationState, Horizon } from './types';

const HORIZON_TOPICS: Record<Horizon, TopicId[]> = {
  under_1_year: ['need_next_year', 'savings_vs_gic', 'tfsa', 'leave_in_chequing'],
  '1_to_5_years': ['horizon', 'savings_vs_gic', 'gic_vs_fund', 'tfsa'],
  over_5_years: ['risk', 'funds', 'fees', 'tfsa_vs_rrsp'],
  not_sure: ['horizon', 'need_next_year', 'saving_vs_investing'],
};

/** For money the customer has committed: keeping it accessible and stable. */
const EARMARK_TOPICS: TopicId[] = ['need_next_year', 'savings_vs_gic', 'tfsa', 'leave_in_chequing'];

const GENERAL_TOPICS: TopicId[] = ['saving_vs_investing', 'risk', 'account_vs_holdings', 'tangerine_help', 'tfsa_vs_rrsp', 'fees', 'gic_vs_fund', 'emergency'];

/** Topics for the "Explore other topics" menu, grouped. */
export const TOPIC_MENU: { heading: string; topics: TopicId[] }[] = [
  { heading: 'Basics', topics: ['saving_vs_investing', 'horizon', 'risk', 'account_vs_holdings', 'leave_in_chequing'] },
  { heading: 'Accounts and products', topics: ['tfsa', 'rrsp', 'tfsa_vs_rrsp', 'gic', 'savings_vs_gic', 'funds', 'gic_vs_fund', 'fees'] },
  { heading: 'Your situation', topics: ['need_next_year', 'emergency', 'debt', 'not_ready', 'first_home'] },
  { heading: 'Tangerine', topics: ['tangerine_help', 'fhsa_tangerine', 'advisors', 'contact'] },
];

export function nextTopics(state: ConversationState, max = 3, exclude: TopicId[] = []): TopicId[] {
  const m = state.memory;
  const active = state.activeTopic;
  const seeds: TopicId[] = [
    ...(active ? TOPICS[active].related : []),
    ...(m.prefs.earmarked && !m.goal ? EARMARK_TOPICS : []),
    ...(m.horizon ? HORIZON_TOPICS[m.horizon] : []),
    ...(m.goal ? (TOPICS_FOR_GOAL[m.goal.type] ?? []) : []),
    ...GENERAL_TOPICS,
  ];
  const unique = seeds.filter((t, i, arr) => arr.indexOf(t) === i && t !== active && !exclude.includes(t));
  const fresh = unique.filter((t) => !m.topicsExplored.includes(t));
  const revisit = unique.filter((t) => m.topicsExplored.includes(t));
  return [...fresh, ...revisit].slice(0, max);
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9$ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function similar(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const ta = new Set(x.split(' '));
  const tb = new Set(y.split(' '));
  const inter = [...ta].filter((w) => tb.has(w)).length;
  return inter / Math.max(ta.size, tb.size) >= 0.8;
}

/** Drop empty, overlong, duplicate and near-duplicate suggestions, and ones repeating the latest customer message. */
export function cleanSuggestions(raw: unknown, latestCustomer: string | null, max = 4): string[] {
  const out: string[] = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (t.length < 3 || t.length > 80) continue;
    if (latestCustomer && similar(t, latestCustomer)) continue;
    if (out.some((o) => similar(o, t))) continue;
    out.push(t);
  }
  return out.slice(0, max);
}

/** Contextual fallback questions (for AI mode when the model's suggestions are empty or unusable). */
export function fallbackQuestions(state: ConversationState, existing: string[], latestCustomer: string | null, max = 3): string[] {
  const out: string[] = [];
  for (const t of nextTopics(state, 8)) {
    const q = TOPICS[t].question;
    if ((latestCustomer && similar(q, latestCustomer)) || existing.some((e) => similar(e, q)) || out.includes(q)) continue;
    out.push(q);
    if (out.length >= max) break;
  }
  return out;
}

export function latestCustomerText(state: ConversationState): string | null {
  return [...state.messages].reverse().find((m) => m.role === 'customer')?.text ?? null;
}
