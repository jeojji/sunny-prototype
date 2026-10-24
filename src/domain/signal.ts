/**
 * Signal engine: decides whether there is a reason for Sunny to *ask a
 * question*. Deterministic and separate from the LLM and dialogue.
 *
 * Rule: "persistently elevated chequing balance". Every daily closing balance
 * in the observation window is at or above the threshold.
 *
 * The signal never determines an investable amount, suitability or a product.
 * Thresholds and windows are prototype assumptions, not Tangerine policy.
 */
import type { DailyBalance } from './history';

export interface SignalConfig {
  /** Minimum daily closing chequing balance (dollars). */
  threshold: number;
  /** Observation window in days, ending today. */
  observationDays: number;
  /** Share of days in the window that must have a closing balance (0–1). */
  minCoverage: number;
}

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = { threshold: 25_000, observationDays: 90, minCoverage: 0.95 };

export interface SignalPrefs {
  /** Customer said this money is already set aside: never show this opportunity nudge again. */
  earmarked: boolean;
  /** "Not now": suppress until this simulated day index (exclusive). */
  dismissedUntil: number | null;
}

export type SignalStatus =
  | 'qualifies'
  | 'not_met'
  | 'insufficient_data'
  | 'suppressed_review'
  | 'suppressed_earmarked'
  | 'suppressed_dismissed';

export interface SignalEvidence {
  windowStart: string | null;
  windowEnd: string | null;
  daysInWindow: number;
  daysWithData: number;
  coverage: number;
  minBalance: number | null;
  maxBalance: number | null;
  averageBalance: number | null;
  daysBelowThreshold: number;
  threshold: number;
  currentBalance: number | null;
}

export interface SignalResult {
  rule: 'elevated_chequing_balance';
  status: SignalStatus;
  /** Whether the opportunity nudge should be shown. */
  show: boolean;
  evidence: SignalEvidence;
  /** Technical notes for demo settings and documentation. */
  checks: { label: string; passed: boolean; detail: string }[];
}

export interface SignalInput {
  history: DailyBalance[];
  todayIndex: number;
  config?: SignalConfig;
  /** Synthetic review flag: unusual or incomplete activity. */
  reviewFlag?: boolean;
  prefs?: SignalPrefs;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`;

export function evaluateElevatedBalance({ history, todayIndex, config = DEFAULT_SIGNAL_CONFIG, reviewFlag = false, prefs }: SignalInput): SignalResult {
  const windowStartDay = todayIndex - config.observationDays + 1;
  const inWindow = history.filter((b) => b.day >= windowStartDay && b.day <= todayIndex && Number.isFinite(b.chequing));
  const balances = inWindow.map((b) => b.chequing);
  const daysWithData = inWindow.length;
  const coverage = config.observationDays > 0 ? daysWithData / config.observationDays : 0;
  const earliest = inWindow.length ? Math.min(...inWindow.map((b) => b.day)) : null;
  const latest = inWindow.length ? Math.max(...inWindow.map((b) => b.day)) : null;
  const sufficient = coverage >= config.minCoverage && earliest !== null && earliest <= windowStartDay + 2 && latest === todayIndex;
  const daysBelow = balances.filter((b) => b < config.threshold).length;
  const today = history.find((b) => b.day === todayIndex);

  const evidence: SignalEvidence = {
    windowStart: history.find((b) => b.day === Math.max(windowStartDay, 0))?.date ?? null,
    windowEnd: today?.date ?? null,
    daysInWindow: config.observationDays,
    daysWithData,
    coverage: Math.round(coverage * 1000) / 1000,
    minBalance: balances.length ? Math.min(...balances) : null,
    maxBalance: balances.length ? Math.max(...balances) : null,
    averageBalance: balances.length ? Math.round((balances.reduce((a, b) => a + b, 0) / balances.length) * 100) / 100 : null,
    daysBelowThreshold: daysBelow,
    threshold: config.threshold,
    currentBalance: today?.chequing ?? null,
  };

  const checks: SignalResult['checks'] = [
    {
      label: 'Enough data',
      passed: sufficient,
      detail: `${daysWithData} of ${config.observationDays} daily closing balances in the window (need ≥ ${Math.round(config.minCoverage * 100)}%, covering the full window).`,
    },
    { label: 'No review flag', passed: !reviewFlag, detail: reviewFlag ? 'Activity is flagged as unusual or incomplete.' : 'No flag on recent activity.' },
    {
      label: 'Balance stayed above threshold',
      passed: sufficient && daysBelow === 0,
      detail:
        evidence.minBalance === null
          ? 'No balances to check.'
          : `Lowest closing balance ${money(evidence.minBalance)}; ${daysBelow} day(s) below ${money(config.threshold)}.`,
    },
    { label: 'Not marked as already set aside', passed: !prefs?.earmarked, detail: prefs?.earmarked ? 'Customer said this money is already set aside.' : 'No earmark recorded.' },
    {
      label: 'Not snoozed',
      passed: !(prefs?.dismissedUntil != null && todayIndex < prefs.dismissedUntil),
      detail: prefs?.dismissedUntil != null && todayIndex < prefs.dismissedUntil ? `Customer chose “Not now”; hidden until day ${prefs.dismissedUntil}.` : 'Not snoozed.',
    },
  ];

  let status: SignalStatus;
  if (!sufficient) status = 'insufficient_data';
  else if (reviewFlag) status = 'suppressed_review';
  else if (daysBelow > 0) status = 'not_met';
  else if (prefs?.earmarked) status = 'suppressed_earmarked';
  else if (prefs?.dismissedUntil != null && todayIndex < prefs.dismissedUntil) status = 'suppressed_dismissed';
  else status = 'qualifies';

  return { rule: 'elevated_chequing_balance', status, show: status === 'qualifies', evidence, checks };
}

/** Customer-facing "Why am I seeing this?" text, built from the actual evidence. */
export function explainSignal(result: SignalResult, observationDays: number): string {
  const e = result.evidence;
  if (e.minBalance === null) return '';
  return (
    `Over the last ${observationDays} days, your chequing balance at the end of each day stayed between ${money(e.minBalance)} and ${money(e.maxBalance ?? e.minBalance)}, ` +
    `never below ${money(e.threshold)}. When a balance stays at that level for a while, Sunny offers a conversation. ` +
    `It’s a reason to ask, not a judgment that the money is available or needs to go anywhere. This was worked out from your Tangerine account activity in this demo (synthetic data); nothing was shared with the AI.`
  );
}
