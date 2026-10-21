import { describe, expect, it } from 'vitest';
import { bandForMonths, calculateScenario, homeSavingsAfterReserve, monthlyCashFlow, parseAmount } from './calc';

describe('calculateScenario', () => {
  it('matches the default confirmed scenario for Alex', () => {
    const r = calculateScenario({ startingSavings: 14000, target: 50000, monthly: 700, months: 36 });
    expect(r.valid).toBe(true);
    expect(r.gap).toBe(36000);
    expect(r.projectedTotal).toBe(39200);
    expect(r.remainingGap).toBe(10800);
    expect(r.requiredMonthly).toBe(1000);
    expect(r.reachesTargetInHorizon).toBe(false);
    expect(r.monthsToTarget).toBe(52);
  });

  it('handles a zero monthly amount without Infinity or NaN', () => {
    const r = calculateScenario({ startingSavings: 0, target: 40000, monthly: 0, months: 60 });
    expect(r.valid).toBe(true);
    expect(r.projectedTotal).toBe(0);
    expect(r.remainingGap).toBe(40000);
    expect(r.monthsToTarget).toBeNull();
    expect(r.requiredMonthly).toBe(667);
    for (const v of [r.gap, r.projectedTotal, r.remainingGap, r.requiredMonthly]) expect(Number.isFinite(v)).toBe(true);
  });

  it('reports a target already reached with no negative gap', () => {
    const r = calculateScenario({ startingSavings: 60000, target: 50000, monthly: 500, months: 12 });
    expect(r.targetAlreadyReached).toBe(true);
    expect(r.gap).toBe(0);
    expect(r.remainingGap).toBe(0);
    expect(r.requiredMonthly).toBeNull();
    expect(r.monthsToTarget).toBeNull();
    expect(r.amountAboveTarget).toBe(16000);
  });

  it('rejects invalid inputs instead of producing misleading numbers', () => {
    expect(calculateScenario({ startingSavings: -1, target: 50000, monthly: 700, months: 36 }).valid).toBe(false);
    expect(calculateScenario({ startingSavings: 0, target: 0, monthly: 700, months: 36 }).valid).toBe(false);
    expect(calculateScenario({ startingSavings: 0, target: 50000, monthly: NaN, months: 36 }).valid).toBe(false);
    expect(calculateScenario({ startingSavings: 0, target: 50000, monthly: 700, months: 0 }).valid).toBe(false);
    expect(calculateScenario({ startingSavings: 0, target: 50000, monthly: 700, months: 2.5 }).valid).toBe(false);
    const bad = calculateScenario({ startingSavings: 0, target: 50000, monthly: Infinity, months: 36 });
    expect(bad.valid).toBe(false);
    expect(bad.errors.monthly).toBeTruthy();
  });
});

describe('helpers', () => {
  it('keeps the emergency reserve inside the savings balance (no double subtraction)', () => {
    expect(homeSavingsAfterReserve(24000, 10000)).toBe(14000);
    expect(homeSavingsAfterReserve(3000, 3000)).toBe(0);
    expect(homeSavingsAfterReserve(3000, 5000)).toBe(0);
  });

  it('computes cash flow and treats missing income as unavailable', () => {
    expect(monthlyCashFlow(4800, 3500, 0)).toBe(1300);
    expect(monthlyCashFlow(0, 3500)).toBeNull();
    expect(monthlyCashFlow(null, null)).toBeNull();
  });

  it('bands timelines', () => {
    expect(bandForMonths(9)).toBe('underOne');
    expect(bandForMonths(12)).toBe('underOne');
    expect(bandForMonths(36)).toBe('oneToFive');
    expect(bandForMonths(60)).toBe('oneToFive');
    expect(bandForMonths(72)).toBe('overFive');
  });

  it('parses loose amounts', () => {
    expect(parseAmount('$1,200')).toBe(1200);
    expect(parseAmount('1.5k')).toBe(1500);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });
});
