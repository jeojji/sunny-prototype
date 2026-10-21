/**
 * Contract between the browser and the local Sunny API, plus validation rules
 * shared by the server tools and the client reducer.
 */
import { isValidMonths, MAX_AMOUNT, type ScenarioInput } from '../lib/calc.ts';

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

export type FactField = 'target' | 'homeSavings' | 'reservedSeparately' | 'monthly' | 'timelineMonths';
export type FactPatch = Partial<Record<FactField, number>>;

/** Customer-stated goal facts. null = not stated/confirmed. */
export interface StatedFacts {
  target: number | null;
  homeSavings: number | null;
  reservedSeparately: number | null;
  monthly: number | null;
  timelineMonths: number | null;
  /** Customer confirmed some home savings are held outside the snapshot accounts. */
  homeSavingsHeldElsewhere: boolean;
}

/** The minimum synthetic snapshot shared with the model, and only after permission. */
export interface Snapshot {
  chequingBalance: number;
  savingsBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  otherSavingsCommitments: number;
}

export type SnapshotPermission = 'not_asked' | 'granted' | 'declined';

export interface ChatRequest {
  firstName: string;
  messages: { role: 'customer' | 'sunny'; text: string }[];
  facts: StatedFacts;
  snapshotPermission: SnapshotPermission;
  /** Present only when snapshotPermission is 'granted'. */
  snapshot: Snapshot | null;
}

export type ChatEffect =
  | { type: 'factsUpdated'; patch: FactPatch; heldElsewhere?: boolean }
  | { type: 'requestSnapshotPermission'; reason: string }
  | { type: 'scenario'; input: ScenarioInput; hypothetical: boolean }
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

export type FactIssue = 'not_a_number' | 'negative' | 'zero_target' | 'too_large' | 'months_invalid';

/** Validate a single customer-stated value. Returns null if acceptable. */
export function checkFactValue(field: FactField, value: unknown): FactIssue | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not_a_number';
  if (value < 0) return 'negative';
  if (field === 'timelineMonths') return isValidMonths(value) ? null : 'months_invalid';
  if (value > MAX_AMOUNT) return 'too_large';
  if (field === 'target' && value === 0) return 'zero_target';
  return null;
}

export const EMPTY_STATED_FACTS: StatedFacts = {
  target: null,
  homeSavings: null,
  reservedSeparately: null,
  monthly: null,
  timelineMonths: null,
  homeSavingsHeldElsewhere: false,
};
