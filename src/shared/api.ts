/**
 * Contract between the browser and the local Sunny API, plus validation rules
 * shared by the server tools and the client reducer.
 */
import { MAX_AMOUNT } from '../lib/calc.ts';

export const LIMITS = {
  /** Most recent messages sent to the model. */
  maxMessages: 16,
  /** Per-message cap for history (longer messages are truncated). */
  maxMessageChars: 2000,
  /** Latest customer message cap (longer is rejected by the composer and server). */
  maxCustomerChars: 1000,
  maxBodyBytes: 64_000,
  maxToolRounds: 5,
  timeoutMs: 45_000,
  maxOutputTokens: 1600,
  maxReplyChars: 4000,
  maxSuggestions: 4,
} as const;

export type AccountKey = 'chequing' | 'savings';
export type PurposeKey = 'upcoming_expenses' | 'emergency' | 'tuition' | 'debt_repayment' | 'other';
export type GoalKey = 'build_wealth' | 'accessible_interest' | 'first_home' | 'understand_options' | 'other';
export type HorizonKey = 'under_1_year' | '1_to_5_years' | 'over_5_years' | 'not_sure';
export type NextStepKey =
  | 'learn_risk'
  | 'compare_options'
  | 'explore_scenario'
  | 'read_product_page'
  | 'prepare_questions'
  | 'save_for_later'
  | 'not_proceeding';

export const PURPOSES: PurposeKey[] = ['upcoming_expenses', 'emergency', 'tuition', 'debt_repayment', 'other'];
export const GOALS: GoalKey[] = ['build_wealth', 'accessible_interest', 'first_home', 'understand_options', 'other'];
export const HORIZONS: HorizonKey[] = ['under_1_year', '1_to_5_years', 'over_5_years', 'not_sure'];
export const NEXT_STEPS: NextStepKey[] = [
  'learn_risk',
  'compare_options',
  'explore_scenario',
  'read_product_page',
  'prepare_questions',
  'save_for_later',
  'not_proceeding',
];

export interface AllocationDTO {
  account: AccountKey;
  purpose: PurposeKey;
  amount: number;
}

export type SnapshotPermission = 'not_asked' | 'granted' | 'declined';

/** Account details shared with the model only after permission. */
export interface AccountContext {
  chequingBalance: number;
  savingsBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  /** The dashboard signal, computed locally from (synthetic) account history. */
  signal: { rule: 'elevated_chequing_balance'; shown: boolean; observationDays: number; threshold: number; minBalance: number | null; maxBalance: number | null } | null;
}

/** Customer-confirmed conversation context (safe to send without permission: the customer said it). */
export interface ConversationContext {
  origin: 'nudge' | 'self' | 'checkin' | null;
  allocations: AllocationDTO[];
  goal: { type: GoalKey; detail: string | null } | null;
  horizon: HorizonKey | null;
  nextStep: NextStepKey | null;
  offeringsViewed: string[];
  /** Earlier visit's next step, for check-ins. */
  previousNextStep: NextStepKey | null;
}

export interface ScenarioDTO {
  start: number;
  monthly: number;
  months: number;
  target: number | null;
}

export interface ChatRequest {
  firstName: string;
  messages: { role: 'customer' | 'sunny'; text: string }[];
  permission: SnapshotPermission;
  /** Present only when permission is 'granted'. */
  account: AccountContext | null;
  context: ConversationContext;
}

export type ChatEffect =
  | { type: 'allocationsUpdated'; allocations: AllocationDTO[] }
  | { type: 'goalSet'; goal: { type: GoalKey; detail: string | null } }
  | { type: 'horizonSet'; horizon: HorizonKey }
  | { type: 'offeringsShown'; ids: string[]; reason: string }
  | { type: 'nextStepSet'; step: NextStepKey }
  | { type: 'scenario'; input: ScenarioDTO }
  | { type: 'requestPermission'; reason: string }
  | { type: 'summaryReady' }
  | { type: 'handoffReady'; questions: string[] };

export interface ChatResponse {
  reply: string;
  sourceIds: string[];
  suggestions: string[];
  effects: ChatEffect[];
}

export type AiErrorCode = 'not_configured' | 'auth_error' | 'rate_limited' | 'timeout' | 'provider_error' | 'bad_request';

export interface ChatErrorBody {
  error: { code: AiErrorCode; message: string };
}

export interface StatusResponse {
  aiAvailable: boolean;
  model: string | null;
  /** Human-readable reason when unavailable. Never contains secrets. */
  reason: string | null;
  /** Present when a live verification was requested. */
  verified?: boolean;
}

export type AmountIssue = 'not_a_number' | 'negative' | 'too_large';

/** Validate a customer-stated dollar amount. Returns null if acceptable. */
export function checkAmount(value: unknown): AmountIssue | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not_a_number';
  if (value < 0) return 'negative';
  if (value > MAX_AMOUNT) return 'too_large';
  return null;
}

export const EMPTY_CONTEXT: ConversationContext = {
  origin: null,
  allocations: [],
  goal: null,
  horizon: null,
  nextStep: null,
  offeringsViewed: [],
  previousNextStep: null,
};
