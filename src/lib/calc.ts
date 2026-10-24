/**
 * Pure, deterministic savings arithmetic. No UI text, no React.
 *
 * All results are illustrative: they exclude interest, investment returns,
 * fees, taxes and changes in circumstances.
 */

export const MAX_MONTHS = 360;
export const MAX_AMOUNT = 10_000_000;

export interface ScenarioInput {
  /** Customer-confirmed savings already set aside for the home goal. */
  startingSavings: number;
  /** Customer's self-selected savings target. */
  target: number;
  /** Monthly amount the customer wants to explore. */
  monthly: number;
  /** Time horizon in whole months. */
  months: number;
}

export type ScenarioField = keyof ScenarioInput;

export interface ScenarioResult {
  valid: boolean;
  errors: Partial<Record<ScenarioField, string>>;
  /** Target minus starting savings, never negative. */
  gap: number;
  /** startingSavings + monthly * months. */
  projectedTotal: number;
  /** Shortfall at the end of the horizon, never negative. */
  remainingGap: number;
  /** Amount projected above the target, never negative. */
  amountAboveTarget: number;
  targetAlreadyReached: boolean;
  reachesTargetInHorizon: boolean;
  /** Whole-dollar monthly amount that would close the gap within the horizon; null when not applicable. */
  requiredMonthly: number | null;
  /** Months needed at the explored monthly amount; null when monthly is 0 or target already reached. */
  monthsToTarget: number | null;
}

export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;
}

export function isValidMonths(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_MONTHS;
}

export function validateScenario(input: ScenarioInput): Partial<Record<ScenarioField, string>> {
  const errors: Partial<Record<ScenarioField, string>> = {};
  if (!isValidAmount(input.startingSavings)) errors.startingSavings = 'Enter an amount of $0 or more.';
  if (!isValidAmount(input.target) || input.target <= 0) errors.target = 'Enter a target greater than $0.';
  if (!isValidAmount(input.monthly)) errors.monthly = 'Enter an amount of $0 or more.';
  if (!isValidMonths(input.months)) errors.months = `Enter a whole number of months between 1 and ${MAX_MONTHS}.`;
  return errors;
}

const roundCents = (n: number) => Math.round(n * 100) / 100;

export function calculateScenario(input: ScenarioInput): ScenarioResult {
  const errors = validateScenario(input);
  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      errors,
      gap: 0,
      projectedTotal: 0,
      remainingGap: 0,
      amountAboveTarget: 0,
      targetAlreadyReached: false,
      reachesTargetInHorizon: false,
      requiredMonthly: null,
      monthsToTarget: null,
    };
  }

  const { startingSavings, target, monthly, months } = input;
  const gap = roundCents(Math.max(0, target - startingSavings));
  const projectedTotal = roundCents(startingSavings + monthly * months);
  const remainingGap = roundCents(Math.max(0, target - projectedTotal));
  const amountAboveTarget = roundCents(Math.max(0, projectedTotal - target));
  const targetAlreadyReached = gap === 0;

  return {
    valid: true,
    errors,
    gap,
    projectedTotal,
    remainingGap,
    amountAboveTarget,
    targetAlreadyReached,
    reachesTargetInHorizon: remainingGap === 0,
    requiredMonthly: targetAlreadyReached ? null : Math.ceil(gap / months),
    monthsToTarget: targetAlreadyReached || monthly <= 0 ? null : Math.ceil(gap / monthly),
  };
}

export type TimelineBand = 'underOne' | 'oneToFive' | 'overFive';

export function bandForMonths(months: number): TimelineBand {
  if (months <= 12) return 'underOne';
  if (months <= 60) return 'oneToFive';
  return 'overFive';
}

/** Monthly take-home minus expenses and other commitments; null when cash flow is unavailable. */
export function monthlyCashFlow(income: number | null, expenses: number | null, otherCommitments = 0): number | null {
  if (!isValidAmount(income) || income <= 0 || !isValidAmount(expenses)) return null;
  return income - expenses - (isValidAmount(otherCommitments) ? otherCommitments : 0);
}

/** How much of a savings balance remains for the home goal after keeping a reserve aside. */
export function homeSavingsAfterReserve(savingsBalance: number, reserve: number): number {
  if (!isValidAmount(savingsBalance)) return 0;
  const r = isValidAmount(reserve) ? reserve : 0;
  return Math.max(0, savingsBalance - r);
}

/** Parse loose customer amount input like "$1,200", "1.5k", "700". Returns null if unparseable. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/[$,\s]/g, '').replace(/cad$/, '');
  if (cleaned === '') return null;
  const match = /^(\d+(?:\.\d+)?)(k)?$/.exec(cleaned);
  if (!match) return null;
  const value = parseFloat(match[1]) * (match[2] ? 1000 : 1);
  return isValidAmount(value) ? roundCents(value) : null;
}

export interface ProjectionInput {
  start: number;
  monthly: number;
  months: number;
  /** Optional self-selected target. */
  target: number | null;
}

export interface ProjectionResult {
  valid: boolean;
  errors: Partial<Record<keyof ProjectionInput, string>>;
  contributions: number;
  total: number;
  /** Shortfall vs. target at the end (null without a target). */
  gapAtEnd: number | null;
  aboveTarget: number | null;
  /** Monthly amount that would reach the target in the period (null without a target or if already reached). */
  requiredMonthly: number | null;
}

/**
 * Illustrative arithmetic for a general goal: starting amount plus equal monthly
 * contributions. Deliberately excludes interest and investment returns: the
 * prototype does not forecast returns.
 */
export function projectWithoutReturns(input: ProjectionInput): ProjectionResult {
  const errors: ProjectionResult['errors'] = {};
  if (!isValidAmount(input.start)) errors.start = 'Enter an amount of $0 or more.';
  if (!isValidAmount(input.monthly)) errors.monthly = 'Enter an amount of $0 or more.';
  if (!isValidMonths(input.months)) errors.months = `Enter a whole number of months between 1 and ${MAX_MONTHS}.`;
  if (input.target !== null && (!isValidAmount(input.target) || input.target <= 0)) errors.target = 'Enter a target greater than $0, or leave it blank.';
  if (Object.keys(errors).length) {
    return { valid: false, errors, contributions: 0, total: 0, gapAtEnd: null, aboveTarget: null, requiredMonthly: null };
  }
  const contributions = roundCents(input.monthly * input.months);
  const total = roundCents(input.start + contributions);
  if (input.target === null) return { valid: true, errors, contributions, total, gapAtEnd: null, aboveTarget: null, requiredMonthly: null };
  const gapToday = Math.max(0, input.target - input.start);
  return {
    valid: true,
    errors,
    contributions,
    total,
    gapAtEnd: roundCents(Math.max(0, input.target - total)),
    aboveTarget: roundCents(Math.max(0, total - input.target)),
    requiredMonthly: gapToday === 0 ? null : Math.ceil(gapToday / input.months),
  };
}
