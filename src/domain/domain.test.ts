import { describe, expect, it } from 'vitest';
import { buildPreset, visibleHistory } from '../data/customers';
import { applyAllocations, summarizeAccount, upsertAllocation } from './allocations';
import { DEFAULT_SIGNAL_CONFIG, evaluateElevatedBalance, explainSignal } from './signal';

const TODAY = 119;

describe('synthetic history', () => {
  it('is internally consistent: each closing balance = previous + that day’s transactions', () => {
    const r = buildPreset('alex');
    for (const account of ['chequing', 'savings'] as const) {
      for (let d = 1; d < r.balances.length; d++) {
        const flow = r.transactions.filter((t) => t.day === d && t.account === account).reduce((s, t) => s + t.amount, 0);
        expect(Math.abs(r.balances[d][account] - (r.balances[d - 1][account] + flow))).toBeLessThan(0.02);
      }
    }
  });

  it('matches the main demo figures for Alex', () => {
    const r = buildPreset('alex');
    expect(r.balances[TODAY].chequing).toBe(28_000);
    expect(r.balances[TODAY].savings).toBe(12_000);
    expect(r.monthlyIncome).toBe(5_200);
    expect(r.monthlyExpenses).toBe(3_600);
    const window = r.balances.slice(TODAY - 89, TODAY + 1).map((b) => b.chequing);
    expect(Math.min(...window)).toBeGreaterThan(25_000);
  });
});

describe('elevated-balance signal', () => {
  const run = (id: string, extra: Partial<Parameters<typeof evaluateElevatedBalance>[0]> = {}) => {
    const r = buildPreset(id);
    return evaluateElevatedBalance({ history: visibleHistory(r, TODAY), todayIndex: TODAY, reviewFlag: r.reviewFlag, ...extra });
  };

  it('qualifies for Alex and explains the actual evidence', () => {
    const s = run('alex');
    expect(s.status).toBe('qualifies');
    expect(s.show).toBe(true);
    expect(s.evidence.daysWithData).toBe(90);
    expect(s.evidence.daysBelowThreshold).toBe(0);
    const why = explainSignal(s, 90);
    expect(why).toMatch(/never below \$25,000/);
    expect(why).not.toMatch(/should|too much|doing nothing|invest this/i);
  });

  it('does not qualify for Sam (no manufactured opportunity)', () => {
    const s = run('sam');
    expect(s.status).toBe('not_met');
    expect(s.show).toBe(false);
    expect(s.evidence.daysBelowThreshold).toBeGreaterThan(0);
  });

  it('reports insufficient data when history is short or has gaps', () => {
    const r = buildPreset('alex');
    r.historyDaysAvailable = 40;
    const s = evaluateElevatedBalance({ history: visibleHistory(r, TODAY), todayIndex: TODAY });
    expect(s.status).toBe('insufficient_data');
    const gappy = buildPreset('alex').balances.filter((b) => b.day <= TODAY && b.day % 7 !== 0);
    expect(evaluateElevatedBalance({ history: gappy, todayIndex: TODAY }).status).toBe('insufficient_data');
  });

  it('suppresses for a review flag, earmarked money and “Not now”', () => {
    expect(run('alex', { reviewFlag: true }).status).toBe('suppressed_review');
    expect(run('alex', { prefs: { earmarked: true, dismissedUntil: null } }).status).toBe('suppressed_earmarked');
    expect(run('alex', { prefs: { earmarked: false, dismissedUntil: TODAY + 30 } }).status).toBe('suppressed_dismissed');
    const later = buildPreset('alex');
    const afterSnooze = evaluateElevatedBalance({
      history: visibleHistory(later, TODAY + 30),
      todayIndex: TODAY + 30,
      prefs: { earmarked: false, dismissedUntil: TODAY + 30 },
    });
    expect(afterSnooze.show).toBe(true);
  });

  it('respects a configurable threshold and window', () => {
    expect(run('alex', { config: { ...DEFAULT_SIGNAL_CONFIG, threshold: 27_500 } }).status).toBe('not_met');
    expect(run('alex', { config: { ...DEFAULT_SIGNAL_CONFIG, observationDays: 30 } }).evidence.daysWithData).toBe(30);
  });
});

describe('allocations', () => {
  const balances = { chequing: 28_000, savings: 12_000 };

  it('Alex: $3,000 upcoming + $10,000 emergency leaves $15,000 not yet assigned; savings is separate', () => {
    const r = applyAllocations(
      [],
      [
        { account: 'chequing', purpose: 'upcoming_expenses', amount: 3_000 },
        { account: 'chequing', purpose: 'emergency', amount: 10_000 },
      ],
      balances,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.unassigned).toBe(15_000);
    expect(summarizeAccount('savings', 12_000, r.list).allocated).toBe(0);
  });

  it('a correction replaces the earlier amount instead of adding to it', () => {
    let list = upsertAllocation([], { account: 'chequing', purpose: 'emergency', amount: 10_000 });
    list = upsertAllocation(list, { account: 'chequing', purpose: 'emergency', amount: 8_000 });
    expect(summarizeAccount('chequing', 28_000, list).unassigned).toBe(20_000);
  });

  it('rejects allocations above the balance and negative amounts', () => {
    const over = applyAllocations([], [{ account: 'chequing', purpose: 'emergency', amount: 30_000 }], balances);
    expect(over).toMatchObject({ ok: false, reason: 'exceeds_balance', total: 30_000 });
    expect(applyAllocations([], [{ account: 'chequing', purpose: 'emergency', amount: -5 }], balances)).toMatchObject({ ok: false, reason: 'negative' });
  });
});
